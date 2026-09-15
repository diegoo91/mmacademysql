import { Router } from 'express'

const MAX_FAILURES = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

// Map of key → { count, lockoutUntil }
const attempts = new Map()

function cleanup() {
  const now = Date.now()
  for (const [key, val] of attempts) {
    if (val.lockoutUntil && val.lockoutUntil < now) attempts.delete(key)
  }
}
// Cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000).unref?.()

export function checkLoginLockout(req, res, next) {
  const email = (req.body?.email || '').toLowerCase()
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  const key = `login:${email}:${ip}`
  const record = attempts.get(key)

  if (record?.lockoutUntil && record.lockoutUntil > Date.now()) {
    const remaining = Math.ceil((record.lockoutUntil - Date.now()) / 60000)
    return res.status(429).json({ error: `Account locked. Try again in ${remaining} min.` })
  }
  next()
}

export function recordLoginFailure(email, ip) {
  const key = `login:${(email || '').toLowerCase()}:${ip || 'unknown'}`
  const record = attempts.get(key) || { count: 0, lockoutUntil: null }

  // If lockout expired, reset
  if (record.lockoutUntil && record.lockoutUntil < Date.now()) {
    record.count = 0
    record.lockoutUntil = null
  }

  record.count++
  if (record.count >= MAX_FAILURES) {
    record.lockoutUntil = Date.now() + LOCKOUT_MS
    record.count = 0
  }
  attempts.set(key, record)
}

export function clearLoginAttempts(email, ip) {
  const key = `login:${(email || '').toLowerCase()}:${ip || 'unknown'}`
  attempts.delete(key)
}
