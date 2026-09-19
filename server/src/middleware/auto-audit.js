import { randomUUID } from 'crypto'
import { verifyAccessToken } from '../utils/tokens.js'
import db from '../db.js'

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'currentPassword', 'newPassword', 'confirmPassword',
  'token', 'secret', 'accessToken', 'refreshToken', 'jwt', 'authorization',
])

const MAX_BODY = 10240

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(redact)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) { out[k] = '***'; continue }
    if (typeof v === 'object' && v !== null) { out[k] = redact(v) }
    else { out[k] = v }
  }
  return out
}

function truncate(s, max) {
  if (!s) return s
  return s.length > max ? s.slice(0, max) : s
}

export function autoAudit(req, res, next) {
  const method = req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()

  const requestId = randomUUID()
  req.requestId = requestId
  const start = performance.now()

  const originalEnd = res.end
  res.end = function (...args) {
    res.end = originalEnd
    res.end(...args)

    const durationMs = Math.round(performance.now() - start)
    const ip = req.ip || req?.connection?.remoteAddress || 'unknown'
    const userAgent = req.headers['user-agent'] || null
    const path = req.originalUrl || req.url
    const query = req.url.includes('?') ? req.url.split('?')[1] : null
    const statusCode = res.statusCode

    let actor = null
    const header = req.headers.authorization
    if (header && header.startsWith('Bearer ')) {
      try {
        const payload = verifyAccessToken(header.slice(7))
        actor = { id: payload.id, name: null, role: payload.role }
      } catch { /* unauthenticated write */ }
    }

    let requestBody = null
    if (req.body && Object.keys(req.body).length > 0) {
      try { requestBody = truncate(JSON.stringify(redact(req.body)), MAX_BODY) } catch { /* ignore */ }
    }

    db.insert('audit_logs', {
      request_id: requestId,
      timestamp: new Date().toISOString(),
      method,
      path: truncate(path, 255),
      query_string: truncate(query, 512),
      actor_id: actor?.id || null,
      actor_name: actor?.name || req.user?.name || 'system',
      actor_role: actor?.role || req.user?.role || 'system',
      ip,
      user_agent: truncate(userAgent, 512),
      action: 'http.request',
      target_type: null,
      target_id: null,
      status_code: statusCode,
      duration_ms: durationMs,
      request_body: requestBody,
      before: null,
      after: null,
      error: statusCode >= 400 ? truncate(JSON.stringify({ status: statusCode }), 2048) : null,
    }).catch(err => {
      console.error('auto-audit failed:', err.message)
    })
  }

  next()
}
