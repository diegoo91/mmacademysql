import { verifyAccessToken } from '../utils/tokens.js'
import db from '../database.js'

export function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = db.get('users', payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })
    const { password_hash, ...safe } = user
    req.user = safe
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return next()
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = db.get('users', payload.id)
    if (user) {
      const { password_hash, ...safe } = user
      req.user = safe
    }
  } catch { /* ignore */ }
  next()
}
