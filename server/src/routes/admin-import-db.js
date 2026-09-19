import { Router } from 'express'
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditLog } from '../middleware/audit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = Router()
const IMPORT_SECRET = process.env.IMPORT_SECRET
const ALLOW_IMPORT_DB = process.env.ALLOW_IMPORT_DB !== 'false'
const BACKUP_DIR = join(__dirname, '..', '..', 'data', 'backups')
const MAX_BACKUPS = 7

// Tables to replace (audit_logs is excluded — preserved across replace)
const COLLECTIONS = [
  'users', 'results', 'slots', 'bookings', 'import_batches',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'court_defaults', 'roles',
]

function createBackup(data) {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(BACKUP_DIR, `db-${ts}.json`)
    writeFileSync(backupPath, JSON.stringify(data, null, 2))
    // Prune old backups
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('db-') && f.endsWith('.json'))
      .sort()
    while (files.length > MAX_BACKUPS) {
      const old = files.shift()
      try { unlinkSync(join(BACKUP_DIR, old)) } catch {}
    }
    return backupPath
  } catch (err) {
    console.error('Backup failed (non-fatal):', err.message)
    return null
  }
}

router.get('/export-db', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    if (!IMPORT_SECRET) {
      return res.status(403).json({ error: 'IMPORT_SECRET not configured on server' })
    }

    const { secret } = req.query
    if (secret !== IMPORT_SECRET) {
      return res.status(403).json({ error: 'Invalid IMPORT_SECRET' })
    }

    const database = await db.exportAll()

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

router.post('/', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    if (!ALLOW_IMPORT_DB) {
      return res.status(403).json({ error: 'DB import is disabled in production (ALLOW_IMPORT_DB=false)' })
    }
    if (!IMPORT_SECRET) {
      return res.status(403).json({ error: 'IMPORT_SECRET not configured on server' })
    }

    const { secret, database, confirm } = req.body
    if (secret !== IMPORT_SECRET) {
      return res.status(403).json({ error: 'Invalid IMPORT_SECRET' })
    }
    if (confirm !== 'REPLACE-ALL') {
      return res.status(400).json({ error: 'Set confirm: "REPLACE-ALL" to proceed' })
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

    // Sanity check: abort if >50% rows would be deleted (unless force flag)
    const currentCounts = {}
    for (const col of COLLECTIONS) {
      const all = await db.findAll(col)
      currentCounts[col] = all.length
    }
    const totalCurrent = Object.values(currentCounts).reduce((a, b) => a + b, 0)
    const totalNew = COLLECTIONS.reduce((a, col) => a + (database[col]?.length || 0), 0)
    if (totalCurrent > 0 && totalNew < totalCurrent * 0.5) {
      return res.status(409).json({
        error: 'Refusing: would delete >50% of data. Use --force or re-export.',
        current_total: totalCurrent,
        new_total: totalNew,
      })
    }

    // Create backup before destructive replace
    const backupData = await db.exportAll()
    const backupPath = createBackup(backupData)

    // Preserve audit_logs — append, never replace
    const existingAuditLogs = database.audit_logs || []
    const currentAuditLogs = backupData.audit_logs || []

    // Build payload for replaceAll (exclude audit_logs from deletion)
    const payload = {}
    for (const col of COLLECTIONS) {
      payload[col] = database[col] || []
    }

    await db.replaceAll(payload)

    // Append existing audit_logs + new audit_logs from the import (not wipe)
    const combinedAudit = [...currentAuditLogs, ...existingAuditLogs]
    await db.clear('audit_logs')
    for (const log of combinedAudit) {
      await db.insert('audit_logs', log)
    }

    const counts = { ...payload, audit_logs: combinedAudit.length }
    console.log(`DB REPLACE by user ${req.user.id} (${req.user.email}):`, counts, backupPath ? `(backup: ${backupPath})` : '(backup failed)')
    await auditLog({ req, action: 'import.db_replace', targetType: 'database', targetId: 'all', after: { counts, user: req.user.email, backup: backupPath } })
    res.json({ ok: true, counts, backup: backupPath })
  } catch (err) {
    console.error('Import database error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
