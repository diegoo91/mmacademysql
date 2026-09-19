import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole, invalidateRoleCache } from '../middleware/rbac.js'
import { ALL_MODULES } from '../utils/modules.js'
import { auditUpdate } from '../middleware/audit.js'

const router = Router()
router.use(authenticate)

// GET / — any authenticated user (dropdowns + Users.jsx defaults)
router.get('/', async (req, res) => {
  try {
    const roles = await db.findAll('roles')
    res.json(roles)
  } catch (err) {
    console.error('List roles error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:name — superadmin only: update permissions for a role
router.put('/:name', requireRole('superadmin'), async (req, res) => {
  try {
    const { name } = req.params
    const { permissions } = req.body

    const role = await db.find('roles', r => r.name === name)
    if (!role) return res.status(404).json({ error: `Role '${name}' not found` })

    // superadmin row is locked to all modules — cannot reduce
    if (name === 'superadmin') {
      return res.status(400).json({ error: 'Superadmin role is locked to all modules and cannot be modified' })
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions must be an array of module names' })
    }

    // Validate every permission against the fixed module list
    const invalid = permissions.filter(p => !ALL_MODULES.includes(p))
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Unknown module(s): ${invalid.join(', ')}. Valid modules: ${ALL_MODULES.join(', ')}` })
    }

    const oldPerms = role.permissions || []
    await db.update('roles', role.id, { permissions, updated_at: new Date().toISOString() })
    await auditUpdate(req, 'role', role.id, { permissions: oldPerms }, { permissions })
    invalidateRoleCache()

    const updated = await db.find('roles', r => r.name === name)
    res.json(updated)
  } catch (err) {
    console.error('Update role error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
