// Single source of truth for all permission module names (v1).
// Used by rbac.js, roles.js, Users.jsx, and the e2e tests.
export const ALL_MODULES = [
  'dashboard', 'bookings', 'schedule', 'players', 'results',
  'users', 'imports', 'comments', 'conversions',
]

export const DEFAULT_ROLE_PERMISSIONS = {
  superadmin: [...ALL_MODULES],
  admin: ALL_MODULES.filter(m => m !== 'users'),
  coach: ['schedule', 'players', 'results'],
  player: [],
}

export const ROLE_HIERARCHY = { superadmin: 4, admin: 3, coach: 2, player: 1 }

export const SYSTEM_ROLES = [
  { name: 'superadmin', display_name: 'Super Admin', level: 4, is_system: true, permissions: DEFAULT_ROLE_PERMISSIONS.superadmin },
  { name: 'admin', display_name: 'Admin', level: 3, is_system: true, permissions: DEFAULT_ROLE_PERMISSIONS.admin },
  { name: 'coach', display_name: 'Coach', level: 2, is_system: true, permissions: DEFAULT_ROLE_PERMISSIONS.coach },
  { name: 'player', display_name: 'Player', level: 1, is_system: true, permissions: DEFAULT_ROLE_PERMISSIONS.player },
]
