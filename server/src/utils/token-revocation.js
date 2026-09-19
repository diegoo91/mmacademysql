import { createHash } from 'crypto'
import db from '../db.js'

// SHA-256 hash of a refresh token — used as the lookup key in app_sessions.
// Tokens are high-entropy random strings so SHA-256 is sufficient (not password-grade).
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId, refreshToken, expiresAt) {
  const token_hash = hashToken(refreshToken)
  return db.insert('app_sessions', {
    user_id: userId,
    refresh_token: token_hash,
    refresh_expires_at: new Date(expiresAt).toISOString(),
    loggedin_at: new Date().toISOString(),
    is_active: '1',
  })
}

export async function findActiveSession(refreshToken) {
  const token_hash = hashToken(refreshToken)
  const row = await db.find('app_sessions', s => s.refresh_token === token_hash && s.is_active === '1')
  return row || null
}

export async function rotateSession(refreshToken) {
  const token_hash = hashToken(refreshToken)
  const row = await db.find('app_sessions', s => s.refresh_token === token_hash && s.is_active === '1')
  if (row) {
    await db.update('app_sessions', row.id, {
      is_active: '0',
      loggedout_at: new Date().toISOString(),
    })
  }
  return row
}

export async function deactivateSession(refreshToken) {
  const token_hash = hashToken(refreshToken)
  const row = await db.find('app_sessions', s => s.refresh_token === token_hash && s.is_active === '1')
  if (row) {
    await db.update('app_sessions', row.id, {
      is_active: '0',
      loggedout_at: new Date().toISOString(),
    })
  }
  return row
}

export async function updateLastRequest(sessionId) {
  try {
    await db.update('app_sessions', sessionId, {
      last_req_at: new Date().toISOString(),
    })
  } catch { /* non-fatal */ }
}
