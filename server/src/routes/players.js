import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { updateUserBalance } from '../utils/balance.js'
import { computePlayerSessions } from '../utils/sessionPaid.js'

const router = Router()
router.use(authenticate)

async function nextMemberCode() {
  const existing = (await db.findAll('users')).map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
  const max = existing.length > 0 ? Math.max(...existing) : 0
  return String(max + 1).padStart(3, '0')
}

router.get('/', requireRole('superadmin', 'admin', 'coach'), async (req, res) => {
  try {
    const { search, skill, page = 1, limit = 50 } = req.query
    let filtered = await db.findAll('users', u => u.role === 'player')
    const allSlots = await db.findAll('slots')
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.phone && p.phone.includes(q)) || (p.member_code && p.member_code.includes(q)))
    }
    if (skill) filtered = filtered.filter(p => p.skill_level === skill)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const total = filtered.length
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
    const players = await Promise.all(filtered.slice(offset, offset + parseInt(limit)).map(async p => {
      const playerName = (p.name || '').toLowerCase()
      const playerSlots = allSlots.filter(s => {
        if (!s.player_text) return false
        if (s.status !== 'player_confirmed') return false
        const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
        return names.includes(playerName)
      })
      const remaining_sessions = playerSlots.length
      let used_private = 0
      let used_group = 0
      for (const s of playerSlots) {
        let type = s.session_type
        if (!type && s.booking_id) {
          const booking = await db.get('bookings', s.booking_id)
          if (booking) type = booking.session_type
        }
        if (type === 'group') used_group++
        else used_private++
      }
      const total_private = (p.private_balance || 0) + used_private
      const total_group = (p.group_balance || 0) + used_group
      return { id: p.id, full_name: p.name, email: p.email, phone: p.phone, dob: p.dob, skill_level: p.skill_level, position: p.position || '', notes: p.notes || '', private_balance: p.private_balance || 0, group_balance: p.group_balance || 0, balance_zero_since: p.balance_zero_since || null, remaining_sessions, used_private, used_group, total_private, total_group, created_at: p.created_at, updated_at: p.updated_at, member_code: p.member_code || '' }
    }))
    res.json({ players, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('List players error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/sessions', requireRole('superadmin', 'admin', 'coach'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const player = await db.get('users', id)
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const { sessions } = await computePlayerSessions(player)
    res.json({ player: { id: player.id, full_name: player.name }, sessions })
  } catch (err) {
    console.error('Player sessions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/report', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const player = await db.get('users', id)
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })

    const isAdmin = req.user && (req.user.role === 'superadmin' || req.user.role === 'admin')
    const isSelf = req.user && req.user.id === player.id
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Access denied' })

    const { sessions, amountOwed } = await computePlayerSessions(player)
    res.json({
      player: { id: player.id, name: player.name, email: player.email, phone: player.phone },
      sessions,
      amount_owed: amountOwed,
    })
  } catch (err) {
    console.error('Player report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', requireRole('superadmin', 'admin', 'coach'), async (req, res) => {
  try {
    const player = await db.get('users', parseInt(req.params.id))
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const { password_hash, ...safe } = player
    res.json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Get player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { full_name, email, phone, dob, skill_level, notes } = req.body
    if (!full_name || !email) return res.status(400).json({ error: 'Full name and email are required' })
    if (await db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already exists' })
    const nameConflict = await db.find('users', u => u.name && u.name.toLowerCase() === full_name.trim().toLowerCase())
    if (nameConflict) return res.status(409).json({ error: `Player "${full_name}" already exists (different email: ${nameConflict.email})` })
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const user = await db.insert('users', {
      name: full_name, email, phone: phone || '', dob: dob || '',
      role: 'player', password_hash: null, is_claimed: false,
      skill_level: skill_level || 'Intermediate', notes: notes || '',
      private_balance: 0, group_balance: 0,
      member_since: new Date().getFullYear().toString(), force_password_change: 1,
      member_code: await nextMemberCode(),
    })
    const { password_hash, ...safe } = user
    res.status(201).json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Create player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const player = await db.get('users', id)
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const { full_name, email, phone, dob, skill_level, position, notes, private_balance, group_balance } = req.body
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const validPositions = ['Right', 'Left', '']
    if (position && !validPositions.includes(position)) return res.status(400).json({ error: 'Invalid position' })
    const updated = await db.update('users', id, {
      name: full_name || player.name,
      email: email || player.email,
      phone: phone ?? player.phone,
      dob: dob ?? player.dob,
      skill_level: skill_level || player.skill_level,
      position: position !== undefined ? position : player.position,
      notes: notes ?? player.notes,
      private_balance: private_balance !== undefined ? Number(private_balance) : player.private_balance,
      group_balance: group_balance !== undefined ? Number(group_balance) : player.group_balance,
    })
    // Track balance_zero_since if balance fields were explicitly set
    if (private_balance !== undefined || group_balance !== undefined) {
      const newPriv = Number(private_balance !== undefined ? private_balance : player.private_balance)
      const newGrp = Number(group_balance !== undefined ? group_balance : player.group_balance)
      await updateUserBalance(id, newPriv, newGrp)
    }
    const { password_hash, ...safe } = updated
    res.json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Update player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const player = await db.get('users', parseInt(req.params.id))
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    await db.remove('users', parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
