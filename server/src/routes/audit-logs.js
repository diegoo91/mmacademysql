import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

// GET / — list audit logs (append-only, no edit/delete endpoints exist)
router.get('/', (req, res) => {
  try {
    const { action, target_type, actor_id, limit = 200, offset = 0 } = req.query
    let logs = db.findAll('audit_logs')
    if (action) logs = logs.filter(l => l.action === action)
    if (target_type) logs = logs.filter(l => l.target_type === target_type)
    if (actor_id) logs = logs.filter(l => l.actor_id === parseInt(actor_id))
    logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    const total = logs.length
    const paged = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit))
    res.json({ logs: paged, total })
  } catch (err) {
    console.error('List audit logs error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
