import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditCreate, auditUpdate, auditDelete, auditRoleChange } from '../middleware/audit.js'
import { updateUserBalance } from '../utils/balance.js'

const router = Router()
router.use(authenticate)

async function nextMemberCode() {
  const existing = (await db.findAll('users')).map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
  const max = existing.length > 0 ? Math.max(...existing) : 0
  return String(max + 1).padStart(3, '0')
}



router.get('/', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const allSlots = await db.findAll('slots')
    const users = (await db.query('users', { orderBy: (a, b) => new Date(b.created_at) - new Date(a.created_at) }))
      .map(({ password_hash, ...u }) => {
        let used_sessions = 0
        if (u.role === 'player') {
          const playerName = (u.name || '').toLowerCase()
          used_sessions = allSlots.filter(s => {
            if (!s.player_text) return false
            if (s.status !== 'player_confirmed') return false
            const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
            return names.includes(playerName)
          }).length
        }
        return { ...u, used_sessions }
      })
    res.json(users)
  } catch (err) {
    console.error('List users error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requireRole('superadmin'), async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' })
    const err = validateLength('name', name, LIMITS.name) || validateLength('email', email, LIMITS.email) || validateLength('phone', phone, LIMITS.phone)
    if (err) return res.status(400).json({ error: err })
    const roleNames = (await db.findAll('roles')).map(r => r.name)
    if (role && !roleNames.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    if (await db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already exists' })
    const nameConflict = await db.find('users', u => u.name && u.name.toLowerCase() === name.trim().toLowerCase())
    if (nameConflict) return res.status(409).json({ error: `User "${name}" already exists (different email: ${nameConflict.email})` })
    const hash = await bcrypt.hash(password, 12)
    const user = await db.insert('users', { name, email, phone: phone || '', role: role || 'player', password_hash: hash, member_since: new Date().getFullYear().toString(), force_password_change: 0, skill_level: 'Intermediate', dob: '', notes: '', private_balance: 0, group_balance: 0, is_claimed: true, member_code: await nextMemberCode() })
    const { password_hash, ...safe } = user
    await auditCreate(req, 'user', user.id, { name, email, role: user.role })
    res.status(201).json(safe)
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
    const { name, email, phone, role, skill_level, notes, private_balance, group_balance } = req.body
    const roleNames = (await db.findAll('roles')).map(r => r.name)
    if (role && !roleNames.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    const err = validateLength('name', name, LIMITS.name) || validateLength('notes', notes, LIMITS.notes)
    if (err) return res.status(400).json({ error: err })
    if (email && email !== user.email) {
      const existing = await db.find('users', u => u.email === email)
      if (existing) return res.status(409).json({ error: 'Email already exists' })
    }
    if (role && role !== user.role && user.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' })
    // Escalation guard: only superadmin may assign the superadmin role
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can assign the superadmin role' })
    }
    const updates = { name: name || user.name, email: email || user.email, phone: phone ?? user.phone, role: role || user.role, skill_level: skill_level || user.skill_level, notes: notes ?? user.notes, private_balance: private_balance !== undefined ? Number(private_balance) : user.private_balance, group_balance: group_balance !== undefined ? Number(group_balance) : user.group_balance }
    const updated = await db.update('users', id, updates)
    const { password_hash, ...safe } = updated
    // Audit role changes
    if (role && role !== user.role) {
      await auditRoleChange(req, id, user.role, role)
    }
    // Audit balance changes
    if (private_balance !== undefined || group_balance !== undefined) {
      await auditUpdate(req, 'user', id,
        { private_balance: user.private_balance, group_balance: user.group_balance },
        { private_balance: updated.private_balance, group_balance: updated.group_balance }
      )
    }
    res.json(safe)
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireRole('superadmin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })
    const user = await db.get('users', id)
    if (!user) return res.status(404).json({ error: 'User not found' })
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
