import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'

const ACCESS_SECRET = process.env.JWT_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '1d'
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || '30d'

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET env vars are required')
}

// Parse duration string like "1d", "30d", "15m", "7d2h" to milliseconds
export function parseDuration(str) {
  if (typeof str === 'number') return str
  const match = String(str).match(/^(\d+)\s*(s|m|h|d|w)$/i)
  if (!match) return 30 * 24 * 60 * 60 * 1000 // fallback 30 days
  const n = parseInt(match[1])
  const unit = match[2].toLowerCase()
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }
  return n * (mult[unit] || mult.d)
}

export function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  )
}

export function signRefreshToken(user) {
  const expiresMs = parseDuration(REFRESH_EXPIRES)
  const expiresAt = Date.now() + expiresMs
  return {
    token: jwt.sign({ id: user.id, jti: randomBytes(16).toString('hex') }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES }),
    expiresAt,
  }
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET)
}

export function cookieOptions(maxAge) {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge,
  }
}

export { REFRESH_EXPIRES }
