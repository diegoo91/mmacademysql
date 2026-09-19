import db from '../db.js'
import { ROLE_HIERARCHY, ALL_MODULES, DEFAULT_ROLE_PERMISSIONS } from '../utils/modules.js'

// In-memory role cache (60s TTL). Avoids DB hit on every request.
let roleCache = new Map()
let cacheExpiry = 0
const CACHE_TTL = 60_000

export async function getRole(name) {
  const now = Date.now()
  if (now < cacheExpiry && roleCache.has(name)) return roleCache.get(name)
  // Refresh entire cache on first miss
  if (now >= cacheExpiry) {
    try {
      const rows = await db.findAll('roles')
      roleCache.clear()
      for (const r of rows) roleCache.set(r.name, r)
      cacheExpiry = now + CACHE_TTL
    } catch { /* fallback to defaults below */ }
  }
  if (roleCache.has(name)) return roleCache.get(name)
  // Fallback: hardcoded default if DB row missing (boot safety)
  if (DEFAULT_ROLE_PERMISSIONS[name]) {
    return { name, permissions: DEFAULT_ROLE_PERMISSIONS[name], level: ROLE_HIERARCHY[name] || 0, is_system: true }
  }
  return null
}

export function invalidateRoleCache() { roleCache.clear(); cacheExpiry = 0 }

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    if ((ROLE_HIERARCHY[req.user.role] || 0) < ROLE_HIERARCHY[minRole]) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

export function requirePermission(module) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const perms = await getUserPermissions(req.user)
    if (!perms.includes(module)) {
      return res.status(403).json({ error: `Access denied: ${module}` })
    }
    next()
  }
}

// Async: returns the union of role.permissions + user.permissions (per-user overrides).
// superadmin short-circuits to ALL_MODULES.
export async function getUserPermissions(user) {
  if (user.role === 'superadmin') return ALL_MODULES
  const role = await getRole(user.role)
  const rolePerms = role?.permissions || DEFAULT_ROLE_PERMISSIONS[user.role] || []
  const userPerms = user.permissions || []
  // Union (deduplicated)
  return [...new Set([...rolePerms, ...userPerms])]
}
