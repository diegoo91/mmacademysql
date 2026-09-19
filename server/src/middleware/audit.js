import db from '../db.js'

/**
 * Append-only audit log. No update or delete API exists for audit_logs.
 * Each entry: { request_id, timestamp, actor_id, actor_name, actor_role, ip,
 *   method, path, action, target_type, target_id, before, after, status_code,
 *   duration_ms, request_body, error }
 * Async — callers MUST await these helpers. Fail-open: errors are logged, never thrown.
 */
export async function auditLog({ req, action, targetType, targetId, before = null, after = null, requestId }) {
  const actor = req?.user || null
  const ip = req?.ip || req?.connection?.remoteAddress || 'unknown'
  const rid = requestId || req?.requestId || null

  await db.insert('audit_logs', {
    request_id: rid || null,
    timestamp: new Date().toISOString(),
    actor_id: actor?.id || null,
    actor_name: actor?.name || 'system',
    actor_role: actor?.role || 'system',
    ip,
    action,
    target_type: targetType || null,
    target_id: targetId ?? null,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  }).catch(err => console.error('auditLog failed:', err.message))
}

/**
 * Convenience helpers for common actions
 */
export function auditLogin(req, success, email) {
  return auditLog({
    req,
    action: success ? 'login.success' : 'login.failure',
    targetType: 'user',
    targetId: email,
    after: { email, success },
  })
}

export function auditLogout(req) {
  return auditLog({ req, action: 'logout', targetType: 'user', targetId: req?.user?.id })
}

export function auditCreate(req, targetType, targetId, record) {
  return auditLog({ req, action: 'create', targetType, targetId, after: record })
}

export function auditUpdate(req, targetType, targetId, before, after) {
  return auditLog({ req, action: 'update', targetType, targetId, before, after })
}

export function auditDelete(req, targetType, targetId, record) {
  return auditLog({ req, action: 'delete', targetType, targetId, before: record })
}

export function auditBalanceChange(req, targetType, targetId, beforeBalance, afterBalance, reason) {
  return auditLog({
    req,
    action: `balance.${reason || 'adjust'}`,
    targetType,
    targetId,
    before: beforeBalance,
    after: afterBalance,
  })
}

export function auditRoleChange(req, targetId, oldRole, newRole) {
  return auditLog({
    req,
    action: 'role.change',
    targetType: 'user',
    targetId,
    before: { role: oldRole },
    after: { role: newRole },
  })
}
