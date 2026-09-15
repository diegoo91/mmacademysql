const ROLE_HIERARCHY = { superadmin: 4, admin: 3, coach: 2, player: 1 }

const DEFAULT_PERMISSIONS = {
  superadmin: ['dashboard', 'bookings', 'schedule', 'players', 'results', 'users', 'imports', 'comments', 'conversions'],
  admin: ['dashboard', 'bookings', 'schedule', 'players', 'results', 'imports', 'comments', 'conversions'],
  coach: ['schedule', 'players', 'results'],
  player: [],
}

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
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const userPerms = req.user.permissions || DEFAULT_PERMISSIONS[req.user.role] || []
    if (!userPerms.includes(module)) {
      return res.status(403).json({ error: `Access denied: ${module}` })
    }
    next()
  }
}

export function getUserPermissions(user) {
  if (user.role === 'superadmin') return DEFAULT_PERMISSIONS.superadmin
  if (user.permissions && user.permissions.length > 0) return user.permissions
  return DEFAULT_PERMISSIONS[user.role] || []
}
