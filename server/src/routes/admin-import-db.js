import { Router } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', '..', 'data', 'academy.db.json')
const router = Router()
const IMPORT_SECRET = process.env.IMPORT_SECRET

const COLLECTIONS = [
  'users', 'results', 'slots', 'bookings', 'import_batches',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'audit_logs', 'court_defaults',
]

router.get('/export-db', authenticate, requireRole('superadmin'), (req, res) => {
  try {
    if (!IMPORT_SECRET) {
      return res.status(403).json({ error: 'IMPORT_SECRET not configured on server' })
    }

    const { secret } = req.query
    if (secret !== IMPORT_SECRET) {
      return res.status(403).json({ error: 'Invalid IMPORT_SECRET' })
    }

    let database
    try {
      database = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
    } catch {
      return res.status(404).json({ error: 'Database file not found' })
    }

    const counts = {}
    for (const col of COLLECTIONS) {
      counts[col] = (database[col] || []).length
    }

    console.log(`DB EXPORT by user ${req.user.id} (${req.user.email}):`, counts)
    res.json(database)
  } catch (err) {
    console.error('Export database error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', authenticate, requireRole('superadmin'), (req, res) => {
  try {
    if (!IMPORT_SECRET) {
      return res.status(403).json({ error: 'IMPORT_SECRET not configured on server' })
    }

    const { secret, database } = req.body
    if (secret !== IMPORT_SECRET) {
      return res.status(403).json({ error: 'Invalid IMPORT_SECRET' })
    }

    if (!database || typeof database !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid "database" field' })
    }

    // Validate shape — every key must be an array
    for (const key of Object.keys(database)) {
      if (!Array.isArray(database[key])) {
        return res.status(400).json({ error: `"${key}" must be an array` })
      }
    }

    const counts = {}
    for (const col of COLLECTIONS) {
      counts[col] = (database[col] || []).length
    }

    db.replace(database)

    console.log(`DB REPLACE by user ${req.user.id} (${req.user.email}):`, counts)
    res.json({ ok: true, counts })
  } catch (err) {
    console.error('Import database error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
