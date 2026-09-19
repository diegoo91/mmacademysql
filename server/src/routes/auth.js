import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import { randomBytes } from 'crypto'
import db from '../db.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken, cookieOptions, parseDuration, REFRESH_EXPIRES } from '../utils/tokens.js'
import { authenticate } from '../middleware/auth.js'
import { getUserPermissions } from '../middleware/rbac.js'
import { checkLoginLockout, recordLoginFailure, clearLoginAttempts } from '../middleware/login-backoff.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { createSession, findActiveSession, rotateSession, deactivateSession } from '../utils/token-revocation.js'
import { auditLogin, auditLogout, auditUpdate, auditCreate } from '../middleware/audit.js'

const REFRESH_MAX_AGE = parseDuration(REFRESH_EXPIRES)

const __dirname = dirname(fileURLToPath(import.meta.url))

async function nextMemberCode() {
  const existing = (await db.findAll('users')).map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
  const max = existing.length > 0 ? Math.max(...existing) : 0
  return String(max + 1).padStart(3, '0')
}
const ALLOWED_AVATAR = new Set(['image/jpeg', 'image/png', 'image/webp'])
const profileStorage = multer.diskStorage({
  destination: join(__dirname, '..', '..', 'data', 'uploads'),
  filename: (req, file, cb) => cb(null, `avatar_${randomBytes(8).toString('hex')}${extname(file.originalname)}`)
})
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AVATAR.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'))
  },
})

const router = Router()

router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, dob, password, skillLevel } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' })
    const err = validateLength('name', name, LIMITS.name) || validateLength('email', email, LIMITS.email) || validateLength('phone', phone, LIMITS.phone)
    if (err) return res.status(400).json({ error: err })
    if (typeof password !== 'string' || password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' })
    if (password.length > 72) return res.status(400).json({ error: 'Password must not exceed 72 characters' })
    if (await db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 12)
    const memberSince = new Date().getFullYear().toString()
    const user = await db.insert('users', { name, email, phone: phone || '', dob: dob || '', password_hash: hash, role: 'player', skill_level: skillLevel || 'Intermediate', member_since: memberSince, force_password_change: 0, notes: '', private_balance: 0, group_balance: 0, is_claimed: true, member_code: await nextMemberCode() })
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: 0, private_balance: 0, group_balance: 0, member_code: user.member_code }
    const accessToken = signAccessToken(safe)
    const { token: refreshToken, expiresAt } = signRefreshToken(safe)
    await createSession(user.id, refreshToken, expiresAt)
    res.cookie('refreshToken', refreshToken, cookieOptions(REFRESH_MAX_AGE))
    await auditCreate(req, 'user', user.id, { name, email, role: 'player', skill_level: skillLevel || 'Intermediate' })
    res.json({ user: safe, accessToken })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/login', checkLoginLockout, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
    const user = await db.find('users', u => u.email === email)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown'
      recordLoginFailure(email, ip)
      await auditLogin(req, false, email)
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    if (user.account_status && user.account_status !== 'active') {
      await auditLogin(req, false, email)
      return res.status(403).json({ error: user.account_status === 'locked' ? 'Account is locked. Contact an administrator.' : 'Account is suspended. Contact an administrator.' })
    }
    clearLoginAttempts(email, req.ip || req.connection?.remoteAddress || 'unknown')
    await auditLogin(req, true, email)
    const permissions = await getUserPermissions(user)
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: user.force_password_change, account_status: user.account_status || 'active', permissions, private_balance: user.private_balance || 0, group_balance: user.group_balance || 0, member_code: user.member_code || '' }
    const accessToken = signAccessToken(safe)
    const { token: refreshToken, expiresAt } = signRefreshToken(safe)
    await createSession(user.id, refreshToken, expiresAt)
    res.cookie('refreshToken', refreshToken, cookieOptions(REFRESH_MAX_AGE))
    res.json({ user: safe, accessToken })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ error: 'No refresh token' })

    const session = await findActiveSession(token)
    if (!session) return res.status(401).json({ error: 'Invalid refresh token' })

    let payload
    try {
      payload = verifyRefreshToken(token)
    } catch {
      await deactivateSession(token)
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    if (session.refresh_expires_at && new Date(session.refresh_expires_at) < new Date()) {
      await deactivateSession(token)
      return res.status(401).json({ error: 'Refresh token expired' })
    }

    await rotateSession(token)

    const user = await db.get('users', payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    if (user.account_status && user.account_status !== 'active') {
      return res.status(403).json({ error: 'Account is locked. Contact an administrator.' })
    }
    const permissions = await getUserPermissions(user)
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: user.force_password_change, account_status: user.account_status || 'active', permissions, private_balance: user.private_balance || 0, group_balance: user.group_balance || 0, member_code: user.member_code || '' }
    const accessToken = signAccessToken(safe)
    const { token: newRefresh, expiresAt } = signRefreshToken(safe)
    await createSession(user.id, newRefresh, expiresAt)
    res.cookie('refreshToken', newRefresh, cookieOptions(REFRESH_MAX_AGE))
    res.json({ user: safe, accessToken })
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', async (req, res) => {
  const token = req.cookies?.refreshToken
  if (token) {
    try {
      await deactivateSession(token)
    } catch { /* ignore */ }
  }
  await auditLogout(req)
  res.clearCookie('refreshToken', { path: '/' })
  res.json({ ok: true })
})

router.get('/me', authenticate, async (req, res) => {
  const user = await db.get('users', req.user.id)
  if (user?.account_status && user.account_status !== 'active') {
    return res.status(403).json({ error: 'Account is locked. Contact an administrator.' })
  }
  const permissions = user ? await getUserPermissions(user) : []
  res.json({ user: { ...req.user, permissions, member_code: user?.member_code || '' } })
})

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' })
    if (typeof newPassword !== 'string' || newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' })
    if (newPassword.length > 72) return res.status(400).json({ error: 'New password must not exceed 72 characters' })
    const user = await db.get('users', req.user.id)
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = await bcrypt.hash(newPassword, 12)
    await db.update('users', req.user.id, { password_hash: hash, force_password_change: 0 })
    await auditUpdate(req, 'user', req.user.id, { password_hash: '***' }, { password_hash: '***', force_password_change: 0 })
    res.json({ ok: true })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/force-change-password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body
    if (!newPassword) return res.status(400).json({ error: 'New password required' })
    if (typeof newPassword !== 'string' || newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' })
    if (newPassword.length > 72) return res.status(400).json({ error: 'New password must not exceed 72 characters' })
    const user = await db.get('users', req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const hash = await bcrypt.hash(newPassword, 12)
    await db.update('users', req.user.id, { password_hash: hash, force_password_change: 0, is_claimed: true })
    await auditUpdate(req, 'user', req.user.id, { force_password_change: 1 }, { force_password_change: 0 })
    res.json({ ok: true })
  } catch (err) {
    console.error('Force change password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, skill_level } = req.body
    const updates = {}
    if (name) updates.name = name
    if (phone !== undefined) updates.phone = phone
    if (skill_level) updates.skill_level = skill_level
    const user = await db.update('users', req.user.id, updates)
    if (!user) return res.status(404).json({ error: 'User not found' })
    await auditUpdate(req, 'user', req.user.id, null, { name: updates.name, phone: updates.phone, skill_level: updates.skill_level })
    const { password_hash, ...safe } = user
    res.json(safe)
  } catch (err) {
    console.error('Update profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/avatar', authenticate, profileUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const avatarPath = `/uploads/${req.file.filename}`
    await db.update('users', req.user.id, { avatar: avatarPath })
    await auditUpdate(req, 'user', req.user.id, null, { avatar: avatarPath })
    res.json({ avatar: avatarPath })
  } catch (err) {
    console.error('Upload avatar error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
