import { verifyAccessToken } from '../utils/tokens.js'
import db from '../db.js'

export async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = await db.get('users', payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    if (user.account_status && user.account_status !== 'active') {
      return res.status(403).json({ error: user.account_status === 'locked' ? 'Account is locked. Contact an administrator.' : 'Account is suspended. Contact an administrator.' })
    }
    const { password_hash, ...safe } = user
    req.user = safe
    next()
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return next()
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = await db.get('users', payload.id)
    if (user) {
      const { password_hash, ...safe } = user
      req.user = safe
    }
  } catch { /* ignore */ }
  next()
}
