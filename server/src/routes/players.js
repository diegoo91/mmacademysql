import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

function nextMemberCode() {
  const existing = db.findAll('users').map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
  const max = existing.length > 0 ? Math.max(...existing) : 0
  return String(max + 1).padStart(3, '0')
}

router.get('/', (req, res) => {
  try {
    const { search, skill, page = 1, limit = 50 } = req.query
    let filtered = db.findAll('users', u => u.role === 'player')
    const allSlots = db.findAll('slots')
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.phone && p.phone.includes(q)) || (p.member_code && p.member_code.includes(q)))
    }
    if (skill) filtered = filtered.filter(p => p.skill_level === skill)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const total = filtered.length
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
    const players = filtered.slice(offset, offset + parseInt(limit)).map(p => {
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
          const booking = db.get('bookings', s.booking_id)
          if (booking) type = booking.session_type
        }
        if (type === 'group') used_group++
        else used_private++
      }
      const total_private = (p.private_balance || 0) + used_private
      const total_group = (p.group_balance || 0) + used_group
      return { id: p.id, full_name: p.name, email: p.email, phone: p.phone, dob: p.dob, skill_level: p.skill_level, position: p.position || '', notes: p.notes || '', private_balance: p.private_balance || 0, group_balance: p.group_balance || 0, balance_zero_since: p.balance_zero_since || null, remaining_sessions, used_private, used_group, total_private, total_group, created_at: p.created_at, updated_at: p.updated_at, member_code: p.member_code || '' }
    })
    res.json({ players, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('List players error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/sessions', (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const player = db.get('users', id)
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const playerName = (player.name || '').toLowerCase()
    const allSlots = db.findAll('slots')
    const sessions = allSlots
      .filter(s => {
        if (!s.player_text) return false
        const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
        return names.includes(playerName)
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
      .map(s => {
        const booking = s.booking_id ? db.get('bookings', s.booking_id) : null
        return { date: s.date, time: s.time, court: s.court, session_type: s.session_type || (booking ? booking.session_type : null), paid: booking ? !!booking.paid : null, booking_ref: booking ? booking.ref : null, status: s.status }
      })
    res.json({ player: { id: player.id, full_name: player.name }, sessions })
  } catch (err) {
    console.error('Player sessions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', (req, res) => {
  try {
    const player = db.get('users', parseInt(req.params.id))
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const { password_hash, ...safe } = player
    res.json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Get player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { full_name, email, phone, dob, skill_level, notes } = req.body
    if (!full_name || !email) return res.status(400).json({ error: 'Full name and email are required' })
    if (db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already exists' })
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const user = db.insert('users', {
      name: full_name, email, phone: phone || '', dob: dob || '',
      role: 'player', password_hash: null, is_claimed: false,
      skill_level: skill_level || 'Intermediate', notes: notes || '',
      private_balance: 0, group_balance: 0,
      member_since: new Date().getFullYear().toString(), force_password_change: 1,
      member_code: nextMemberCode(),
    })
    const { password_hash, ...safe } = user
    res.status(201).json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Create player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const player = db.get('users', id)
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    const { full_name, email, phone, dob, skill_level, position, notes, private_balance, group_balance } = req.body
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const validPositions = ['Right', 'Left', '']
    if (position && !validPositions.includes(position)) return res.status(400).json({ error: 'Invalid position' })
    const updated = db.update('users', id, {
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
    const { password_hash, ...safe } = updated
    res.json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Update player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const player = db.get('users', parseInt(req.params.id))
    if (!player || player.role !== 'player') return res.status(404).json({ error: 'Player not found' })
    db.remove('users', parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete player error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
