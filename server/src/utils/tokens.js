import jwt from 'jsonwebtoken'
import { generateJti, isRefreshTokenRevoked } from './token-revocation.js'

const ACCESS_SECRET = process.env.JWT_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '15m'
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || '7d'

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET env vars are required')
}

export function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  )
}

export function signRefreshToken(user) {
  const jti = generateJti()
  return { token: jwt.sign({ id: user.id, jti }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES }), jti }
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, REFRESH_SECRET)
  if (payload.jti && isRefreshTokenRevoked(payload.jti)) {
    throw new Error('Refresh token revoked')
  }
  return payload
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
