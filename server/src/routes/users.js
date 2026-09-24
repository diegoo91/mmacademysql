import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditCreate, auditUpdate, auditDelete, auditRoleChange, auditBalanceChange } from '../middleware/audit.js'
import { updateUserBalance, ensureCycleFresh, effectivePrivate, effectiveGroupBalance, monthlyDisplay } from '../utils/balance.js'
import { computePlayerSessions } from '../utils/sessionPaid.js'

const router = Router()

// Public: active coaches for the home page (no auth, no sensitive fields)
router.get('/public/coaches', async (req, res) => {
  try {
    const all = await db.findAll('users')
    const coaches = all
      .filter(u => u.role === 'coach' && (!u.account_status || u.account_status === 'active'))
      .map(u => ({
        id: u.id,
        name: u.name || '',
        skill_level: u.skill_level || '',
        notes: u.notes || '',
        avatar: u.avatar || null,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    res.json(coaches)
  } catch (err) {
    console.error('Public coaches error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.use(authenticate)

async function nextMemberCode() {
  const existing = (await db.findAll('users')).map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
  const max = existing.length > 0 ? Math.max(...existing) : 0
  return String(max + 1).padStart(3, '0')
}

async function enrichPlayer(p, allSlots, bookingsById) {
  const playerName = (p.name || '').toLowerCase()
  const playerSlots = allSlots.filter(s => {
    if (!s.player_text) return false
    if (s.status !== 'player_confirmed') return false
    const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
    return names.includes(playerName)
  })
  let used_private = 0
  let used_group = 0
  for (const s of playerSlots) {
    let type = s.session_type
    if (!type && s.booking_id) {
      const booking = bookingsById.get(s.booking_id) || await db.get('bookings', s.booking_id)
      if (booking) {
        bookingsById.set(s.booking_id, booking)
        type = booking.session_type
      }
    }
    if (type === 'group') used_group++
    else used_private++
  }
  const { effectivePrivate, effectiveGroupBalance, monthlyDisplay } = await import('../utils/balance.js')
  const private_balance = effectivePrivate(p)
  const group_balance = effectiveGroupBalance(p)
  const monthly = monthlyDisplay(p)
  const remaining_sessions = private_balance + group_balance
  const total_private = private_balance + used_private
  const total_group = group_balance + used_group
  return {
    used_sessions: playerSlots.length,
    used_private,
    used_group,
    remaining_sessions,
    private_balance,
    group_balance,
    cycle_private: monthly.private,
    cycle_group: monthly.group,
    cycle_expires_at: monthly.expires_at,
    legacy_private: monthly.legacy_private,
    legacy_group: monthly.legacy_group,
    paid_this_cycle: monthly.paid_this_cycle,
    total_private,
    total_group,
    full_name: p.name,
    dob: p.dob || '',
    position: p.position || '',
    notes: p.notes || '',
    balance_zero_since: p.balance_zero_since || null,
    member_code: p.member_code || '',
  }
}

router.get('/', requireRole('superadmin', 'admin', 'coach'), async (req, res) => {
  try {
    const { search, role, skill, page, limit } = req.query
    const isCoach = req.user.role === 'coach'
    const allSlots = isCoach || role || page || limit ? await db.findAll('slots') : await db.findAll('slots')
    const bookingsById = new Map()

    let users = await db.query('users', { orderBy: (a, b) => new Date(b.created_at) - new Date(a.created_at) })

    if (isCoach) users = users.filter(u => u.role === 'player')
    if (role) users = users.filter(u => u.role === role)
    if (skill) users = users.filter(u => u.skill_level === skill)
    if (search) {
      const q = search.toLowerCase()
      users = users.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.member_code && u.member_code.includes(q))
      )
    }

    const total = users.length
    const wantsListShape = role === 'player' || page !== undefined || limit !== undefined
    const pageSize = parseInt(limit) || 0
    const pageNum = Math.max(1, parseInt(page) || 1)
    const slice = pageSize > 0 ? users.slice((pageNum - 1) * pageSize, (pageNum - 1) * pageSize + pageSize) : users

    const enriched = await Promise.all(slice.map(async ({ password_hash, ...u }) => {
      if (u.role !== 'player') return { ...u, used_sessions: 0, used_private: 0, used_group: 0, remaining_sessions: null, total_private: null, total_group: null, full_name: u.name, dob: u.dob || '', position: u.position || '', notes: u.notes || '' }
      const stats = await enrichPlayer(u, allSlots, bookingsById)
      return { ...u, ...stats }
    }))

    if (wantsListShape) {
      return res.json({ players: enriched.filter(u => u.role === 'player'), users: enriched, total, page: pageNum, limit: pageSize || total })
    }
    res.json(enriched)
  } catch (err) {
    console.error('List users error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/export-credentials', requireRole('superadmin'), async (req, res) => {
  try {
    const allUsers = (await db.findAll('users')).sort((a, b) => (a.member_code || '').localeCompare(b.member_code || ''))
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('User Credentials')

    sheet.columns = [
      { header: 'Member Code', key: 'member_code', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Password', key: 'password', width: 30 },
      { header: 'Already Claimed', key: 'claimed', width: 18 },
    ]

    let credentialsGenerated = 0

    for (const u of allUsers) {
      if (!u.password_hash) {
        const tempPassword = crypto.randomBytes(4).toString('hex') + '!' + crypto.randomInt(100, 999)
        const hash = await bcrypt.hash(tempPassword, 12)
        await db.update('users', u.id, { password_hash: hash, force_password_change: 1, is_claimed: true })
        sheet.addRow({
          member_code: u.member_code || '',
          name: u.name,
          email: u.email,
          role: u.role,
          password: tempPassword,
          claimed: 'No',
        })
        credentialsGenerated++
      } else {
        sheet.addRow({
          member_code: u.member_code || '',
          name: u.name,
          email: u.email,
          role: u.role,
          password: '',
          claimed: 'Yes',
        })
      }
    }

    await auditCreate(req, 'credentials_export', 0, { count: credentialsGenerated, total: allUsers.length })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=mm-padel-credentials.xlsx')
    await workbook.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Export credentials error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', requireRole('superadmin', 'admin', 'coach'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (req.user.role === 'coach' && user.role !== 'player') return res.status(403).json({ error: 'Access denied' })
    const { password_hash, ...safe } = user
    let stats = {}
    if (user.role === 'player') {
      const allSlots = await db.findAll('slots')
      stats = await enrichPlayer(user, allSlots, new Map())
    }
    res.json({ ...safe, ...stats, full_name: safe.name })
  } catch (err) {
    console.error('Get user error:', err)
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

router.post('/', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, full_name, email, phone, role, password, dob, skill_level, notes, position } = req.body
    const displayName = (full_name || name || '').trim()
    const effectiveRole = role || 'player'
    if (!displayName || !email) return res.status(400).json({ error: 'Name and email are required' })
    if (effectiveRole !== 'player' && !password) return res.status(400).json({ error: 'Password is required for non-player users' })
    if (effectiveRole !== 'player' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Only superadmin can create non-player users' })
    const err = validateLength('name', displayName, LIMITS.name) || validateLength('email', email, LIMITS.email) || validateLength('phone', phone, LIMITS.phone)
    if (err) return res.status(400).json({ error: err })
    const roleNames = (await db.findAll('roles')).map(r => r.name)
    if (!roleNames.includes(effectiveRole)) return res.status(400).json({ error: 'Invalid role' })
    if (await db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already exists' })
    const nameConflict = await db.find('users', u => u.name && u.name.toLowerCase() === displayName.toLowerCase())
    if (nameConflict) return res.status(409).json({ error: `User "${displayName}" already exists (different email: ${nameConflict.email})` })
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const hash = password ? await bcrypt.hash(password, 12) : null
    const user = await db.insert('users', {
      name: displayName, email, phone: phone || '', role: effectiveRole,
      password_hash: hash, member_since: new Date().getFullYear().toString(),
      force_password_change: password ? 0 : 1,
      skill_level: skill_level || 'Intermediate', dob: dob || '', position: position || '',
      notes: notes || '', private_balance: 0, group_balance: 0,
      is_claimed: !!password, member_code: await nextMemberCode(),
    })
    const { password_hash, ...safe } = user
    await auditCreate(req, 'user', user.id, { name: displayName, email, role: user.role })
    res.status(201).json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Create user error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const { name, full_name, email, phone, role, skill_level, notes, dob, position } = req.body
    const roleNames = (await db.findAll('roles')).map(r => r.name)
    if (role && !roleNames.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    const resolvedName = full_name || name
    const err = validateLength('name', resolvedName, LIMITS.name) || validateLength('notes', notes, LIMITS.notes)
    if (err) return res.status(400).json({ error: err })
    if (email && email !== user.email) {
      const existing = await db.find('users', u => u.email === email)
      if (existing) return res.status(409).json({ error: 'Email already exists' })
    }
    if (role && role !== user.role && user.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' })
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can assign the superadmin role' })
    }
    const validSkills = ['Beginner', 'Intermediate', 'Advanced']
    if (skill_level && !validSkills.includes(skill_level)) return res.status(400).json({ error: 'Invalid skill level' })
    const validPositions = ['Right', 'Left', '']
    if (position !== undefined && position !== null && !validPositions.includes(position)) return res.status(400).json({ error: 'Invalid position' })
    // Balances are controlled only via POST /:id/balance (profile one-by-one)
    const updates = {
      name: resolvedName || user.name,
      email: email || user.email,
      phone: phone ?? user.phone,
      role: role || user.role,
      skill_level: skill_level || user.skill_level,
      notes: notes ?? user.notes,
      dob: dob ?? user.dob,
      position: position !== undefined ? position : user.position,
    }
    const updated = await db.update('users', id, updates)
    const { password_hash, ...safe } = updated
    if (role && role !== user.role) {
      await auditRoleChange(req, id, user.role, role)
    }
    res.json({ ...safe, full_name: safe.name })
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Per-user balance control (profile only — one player at a time)
// body: { cycle_private?, cycle_group?, cycle_expires_at?, expire_now?, private_balance?, group_balance? }
router.post('/:id/balance', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    let user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.role !== 'player') return res.status(400).json({ error: 'Balance controls are for players only' })

    const {
      cycle_private,
      cycle_group,
      cycle_expires_at,
      expire_now,
      private_balance,
      group_balance,
    } = req.body

    const before = {
      private_balance: user.private_balance,
      group_balance: user.group_balance,
      cycle_private: user.cycle_private,
      cycle_group: user.cycle_group,
      cycle_expires_at: user.cycle_expires_at,
      cycle_key: user.cycle_key,
    }

    user = (await ensureCycleFresh(user, { notify: false })) || user

    const updates = {}

    if (expire_now) {
      const { currentCycleKey } = await import('../utils/cycle.js')
      const remP = Math.max(0, user.cycle_private || 0)
      const remG = Math.max(0, user.cycle_group || 0)
      const paidP = user.cycle_private_paid || 0
      const paidG = user.cycle_group_paid || 0
      updates.cycle_private = 0
      updates.cycle_group = 0
      updates.cycle_key = null
      updates.cycle_expires_at = null
      updates.cycle_private_paid = 0
      updates.cycle_group_paid = 0
      await db.update('users', id, updates)
      await auditUpdate(req, 'user', id, before, { ...before, ...updates, expired: { private: remP, group: remG, paidP, paidG } })
      await auditBalanceChange(req, 'user', id, before, { ...before, ...updates }, 'balance.cycle_expire_now')
      const after = await db.get('users', id)
      const { password_hash, ...safe } = after
      const monthly = monthlyDisplay(safe)
      return res.json({
        ...safe,
        effective_private: effectivePrivate(safe),
        effective_group: effectiveGroupBalance(safe),
        cycle_private: monthly.private,
        cycle_group: monthly.group,
        cycle_expires_at: monthly.expires_at,
        legacy_private: monthly.legacy_private,
        legacy_group: monthly.legacy_group,
        full_name: safe.name,
      })
    }

    if (cycle_private !== undefined || cycle_group !== undefined || cycle_expires_at !== undefined) {
      const { currentCycleKey, cycleExpiryFor } = await import('../utils/cycle.js')
      let key = user.cycle_key
      if (cycle_private !== undefined || cycle_group !== undefined) {
        const newP = Math.max(0, parseInt(cycle_private, 10) || 0)
        const newG = Math.max(0, parseInt(cycle_group, 10) || 0)
        if (!key) key = currentCycleKey()
        updates.cycle_private = newP
        updates.cycle_group = newG
        if (!user.cycle_key || user.cycle_key !== key) {
          updates.cycle_private_paid = newP
          updates.cycle_group_paid = newG
        }
      }
      if (cycle_expires_at !== undefined) {
        if (cycle_expires_at === null || cycle_expires_at === '') {
          updates.cycle_expires_at = null
        } else {
          const d = new Date(cycle_expires_at)
          if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid cycle_expires_at' })
          if (!key) key = currentCycleKey()
          updates.cycle_expires_at = d.toISOString().replace('T', ' ').slice(0, 19)
        }
      } else if (key && !user.cycle_expires_at) {
        updates.cycle_expires_at = cycleExpiryFor(key)
      }
      if (key) updates.cycle_key = key
    }

    if (private_balance !== undefined || group_balance !== undefined) {
      const legP = private_balance !== undefined ? Math.max(0, parseInt(private_balance, 10) || 0) : Math.max(0, user.private_balance || 0)
      const legG = group_balance !== undefined ? Math.max(0, parseInt(group_balance, 10) || 0) : Math.max(0, user.group_balance || 0)
      updates.private_balance = legP
      updates.group_balance = legG
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No balance fields provided' })
    }

    const updated = await db.update('users', id, updates)
    // updateUserBalance writes legacy again — only call if legacy changed outside updates
    if (private_balance !== undefined || group_balance !== undefined) {
      await updateUserBalance(id, Number(updates.private_balance ?? user.private_balance), Number(updates.group_balance ?? user.group_balance))
    }

    const after = await db.get('users', id)
    const { password_hash, ...safe } = after
    await auditUpdate(req, 'user', id, before, {
      private_balance: safe.private_balance,
      group_balance: safe.group_balance,
      cycle_private: safe.cycle_private,
      cycle_group: safe.cycle_group,
      cycle_expires_at: safe.cycle_expires_at,
    })
    await auditBalanceChange(req, 'user', id, before, {
      private_balance: safe.private_balance,
      group_balance: safe.group_balance,
      cycle_private: safe.cycle_private,
      cycle_group: safe.cycle_group,
      cycle_expires_at: safe.cycle_expires_at,
    }, 'balance.profile_control')

    const monthly = monthlyDisplay(safe)
    res.json({
      ...safe,
      effective_private: effectivePrivate(safe),
      effective_group: effectiveGroupBalance(safe),
      cycle_private: monthly.private,
      cycle_group: monthly.group,
      cycle_expires_at: monthly.expires_at,
      legacy_private: monthly.legacy_private,
      legacy_group: monthly.legacy_group,
      full_name: safe.name,
    })
  } catch (err) {
    console.error('Balance control error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.role !== 'player' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Only superadmin can delete non-player users' })
    await auditDelete(req, 'user', id, { name: user.name, email: user.email, role: user.role })
    await db.remove('users', id)
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete user error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/reset-password', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const target = await db.get('users', id)
    if (!target) return res.status(404).json({ error: 'User not found' })
    const tempPass = 'ChangeMe' + crypto.randomInt(100000, 999999)
    const hash = await bcrypt.hash(tempPass, 12)
    await db.update('users', id, { password_hash: hash, force_password_change: 1 })
    await auditUpdate(req, 'user', id, { password_hash: '***' }, { password_hash: 'reset', force_password_change: 1 })
    res.json({ ok: true, tempPassword: tempPass })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id/account-status', requireRole('superadmin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot change your own account status' })
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const { status } = req.body
    if (!status || !['active', 'locked'].includes(status)) return res.status(400).json({ error: 'Status must be "active" or "locked"' })
    const previous = user.account_status || 'active'
    await db.update('users', id, { account_status: status })
    await auditUpdate(req, 'user', id, { account_status: previous }, { account_status: status })
    res.json({ ok: true, account_status: status })
  } catch (err) {
    console.error('Update account status error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/convert', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.role !== 'player') return res.status(400).json({ error: 'Can only convert balances for players' })

    const { from, count } = req.body
    if (!from || !count || count <= 0) return res.status(400).json({ error: 'Invalid conversion params' })
    if (from !== 'private' && from !== 'group') return res.status(400).json({ error: 'from must be "private" or "group"' })

    const priv = user.private_balance || 0
    const grp = user.group_balance || 0
    const before = { private_balance: priv, group_balance: grp }

    if (from === 'private') {
      if (priv < count) return res.status(400).json({ error: `Insufficient private balance (${priv} available, need ${count})` })
      await updateUserBalance(id, priv - count, grp + count * 2)
    } else {
      if (grp < count * 2) return res.status(400).json({ error: `Insufficient group balance (${grp} available, need ${count * 2})` })
      await updateUserBalance(id, priv + count, grp - count * 2)
    }

    const updated = await db.get('users', id)
    await auditUpdate(req, 'user', id, before, { private_balance: updated.private_balance, group_balance: updated.group_balance })
    const { password_hash, ...safe } = updated
    res.json(safe)
  } catch (err) {
    console.error('Convert balance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /auto-lock-inactive — superadmin: lock players inactive for >30 days
router.post('/auto-lock-inactive', requireRole('superadmin'), async (req, res) => {
  try {
    const days = parseInt(req.body?.days) || 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const players = await db.findAll('users', u => u.role === 'player')
    const slots = await db.findAll('slots')
    const locked = []

    for (const player of players) {
      if (player.account_status === 'locked') continue

      const playerName = (player.name || '').toLowerCase()
      const myConfirmed = slots
        .filter(s => {
          if (s.status !== 'player_confirmed') return false
          if (!s.player_text) return false
          const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
          return names.includes(playerName)
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      const lastDate = myConfirmed[0]?.date
      if (!lastDate || lastDate < cutoffStr) {
        await db.update('users', player.id, { account_status: 'locked' })
        await auditUpdate(req, 'user', player.id,
          { account_status: 'active', last_session_date: lastDate || null },
          { account_status: 'locked', reason: `inactive_${days}_days` })
        locked.push({ id: player.id, name: player.name, last_session: lastDate || 'never' })
      }
    }

    res.json({ locked_count: locked.length, locked })
  } catch (err) {
    console.error('Auto-lock error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
