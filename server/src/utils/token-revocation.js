import { nanoid } from 'nanoid'

// In-memory refresh token revocation store
// Key: jti (unique token id), Value: { revokedAt }
const revokedTokens = new Map()

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now()
  // Tokens older than 7 days (max refresh lifetime) can be removed
  for (const [jti, val] of revokedTokens) {
    if (val.revokedAt < now - 7 * 24 * 60 * 60 * 1000) {
      revokedTokens.delete(jti)
    }
  }
}, 10 * 60 * 1000).unref?.()

export function generateJti() {
  return nanoid(21)
}

export function revokeRefreshToken(jti) {
  if (jti) revokedTokens.set(jti, { revokedAt: Date.now() })
}

export function isRefreshTokenRevoked(jti) {
  return revokedTokens.has(jti)
}
