import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import { randomBytes } from 'crypto'
import db from '../database.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken, cookieOptions } from '../utils/tokens.js'
import { authenticate } from '../middleware/auth.js'
import { getUserPermissions } from '../middleware/rbac.js'
import { checkLoginLockout, recordLoginFailure, clearLoginAttempts } from '../middleware/login-backoff.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { revokeRefreshToken } from '../utils/token-revocation.js'
import { auditLogin, auditLogout } from '../middleware/audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function nextMemberCode() {
  const existing = db.findAll('users').map(u => parseInt(u.member_code)).filter(n => !isNaN(n))
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

router.post('/signup', (req, res) => {
  try {
    const { name, email, phone, dob, password, skillLevel } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' })
    const err = validateLength('name', name, LIMITS.name) || validateLength('email', email, LIMITS.email) || validateLength('phone', phone, LIMITS.phone)
    if (err) return res.status(400).json({ error: err })
    if (db.find('users', u => u.email === email)) return res.status(409).json({ error: 'Email already registered' })
    const hash = bcrypt.hashSync(password, 12)
    const memberSince = new Date().getFullYear().toString()
    const user = db.insert('users', { name, email, phone: phone || '', dob: dob || '', password_hash: hash, role: 'player', skill_level: skillLevel || 'Intermediate', member_since: memberSince, force_password_change: 0, notes: '', private_balance: 0, group_balance: 0, is_claimed: true, member_code: nextMemberCode() })
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: 0, private_balance: 0, group_balance: 0, member_code: user.member_code }
    const accessToken = signAccessToken(safe)
    const { token: refreshToken } = signRefreshToken(safe)
    res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000))
    res.json({ user: safe, accessToken })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/login', checkLoginLockout, (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
    const user = db.find('users', u => u.email === email)
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown'
      recordLoginFailure(email, ip)
      auditLogin(req, false, email)
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    clearLoginAttempts(email, req.ip || req.connection?.remoteAddress || 'unknown')
    auditLogin(req, true, email)
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: user.force_password_change, permissions: getUserPermissions(user), private_balance: user.private_balance || 0, group_balance: user.group_balance || 0, member_code: user.member_code || '' }
    const accessToken = signAccessToken(safe)
    const { token: refreshToken } = signRefreshToken(safe)
    res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000))
    res.json({ user: safe, accessToken })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/refresh', (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ error: 'No refresh token' })
    const payload = verifyRefreshToken(token)
    // Revoke old refresh token (rotate)
    if (payload.jti) revokeRefreshToken(payload.jti)
    const user = db.get('users', payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role, skill_level: user.skill_level, force_password_change: user.force_password_change, permissions: getUserPermissions(user), private_balance: user.private_balance || 0, group_balance: user.group_balance || 0, member_code: user.member_code || '' }
    const accessToken = signAccessToken(safe)
    const { token: newRefresh } = signRefreshToken(safe)
    res.cookie('refreshToken', newRefresh, cookieOptions(7 * 24 * 60 * 60 * 1000))
    res.json({ user: safe, accessToken })
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', (req, res) => {
  // Revoke the refresh token if present
  const token = req.cookies?.refreshToken
  if (token) {
    try {
      const payload = jwt.decode(token)
      if (payload?.jti) revokeRefreshToken(payload.jti)
    } catch { /* ignore */ }
  }
  auditLogout(req)
  res.clearCookie('refreshToken', { path: '/' })
  res.json({ ok: true })
})

router.get('/me', authenticate, (req, res) => {
  const user = db.get('users', req.user.id)
  const permissions = user ? getUserPermissions(user) : []
  res.json({ user: { ...req.user, permissions, member_code: user?.member_code || '' } })
})

router.post('/change-password', authenticate, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
    const user = db.get('users', req.user.id)
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = bcrypt.hashSync(newPassword, 12)
    db.update('users', req.user.id, { password_hash: hash, force_password_change: 0 })
    res.json({ ok: true })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/force-change-password', authenticate, (req, res) => {
  try {
    const { newPassword } = req.body
    if (!newPassword) return res.status(400).json({ error: 'New password required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
    const user = db.get('users', req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const hash = bcrypt.hashSync(newPassword, 12)
    db.update('users', req.user.id, { password_hash: hash, force_password_change: 0, is_claimed: true })
    auditUpdate(req, 'user', req.user.id, { force_password_change: 1 }, { force_password_change: 0 })
    res.json({ ok: true })
  } catch (err) {
    console.error('Force change password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/profile', authenticate, (req, res) => {
  try {
    const { name, phone, skill_level } = req.body
    const updates = {}
    if (name) updates.name = name
    if (phone !== undefined) updates.phone = phone
    if (skill_level) updates.skill_level = skill_level
    const user = db.update('users', req.user.id, updates)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const { password_hash, ...safe } = user
    res.json(safe)
  } catch (err) {
    console.error('Update profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/avatar', authenticate, profileUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const avatarPath = `/uploads/${req.file.filename}`
    db.update('users', req.user.id, { avatar: avatarPath })
    res.json({ avatar: avatarPath })
  } catch (err) {
    console.error('Upload avatar error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
