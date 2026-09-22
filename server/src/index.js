import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import playersRoutes from './routes/players.js'
import resultsRoutes from './routes/results.js'
import slotsRoutes from './routes/slots.js'
import bookingsRoutes from './routes/bookings.js'
import importsRoutes from './routes/imports.js'
import dashboardRoutes from './routes/dashboard.js'
import commentsRoutes from './routes/comments.js'
import notificationsRoutes from './routes/notifications.js'
import conversionRequestsRoutes from './routes/conversion-requests.js'
import expensesRoutes from './routes/expenses.js'
import reportsRoutes from './routes/reports.js'
import bookingRequestsRoutes from './routes/booking-requests.js'
import paymentsRoutes from './routes/payments.js'
import auditLogsRoutes from './routes/audit-logs.js'
import adminImportDbRoutes from './routes/admin-import-db.js'
import rolesRoutes from './routes/roles.js'
import transfersRoutes from './routes/transfers.js'
import guestBookingRequestsRoutes from './routes/guest-booking-requests.js'
import { ensureAdmin } from './ensure-admin.js'
import { autoAudit } from './middleware/auto-audit.js'
import { SYSTEM_ROLES } from './utils/modules.js'
import db from './db.js'

const app = express()
const PORT = process.env.PORT || 5174
const isProd = process.env.NODE_ENV === 'production'

// Trust proxy (required for correct req.ip behind Render's reverse proxy)
app.set('trust proxy', 1)

// Build allowed origins list dynamically
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
]
// FRONTEND_URL accepts a comma-separated list so www + apex can both be allowed, e.g.
// FRONTEND_URL=https://www.mmacademy.com,https://mmacademy.com
for (const o of (process.env.FRONTEND_URL || '').split(',')) {
  const origin = o.trim()
  if (origin && !allowedOrigins.includes(origin)) allowedOrigins.push(origin)
}

// Security headers — CSP enabled, HSTS in production
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
    },
  } : false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginResourcePolicy: false,
}))

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true)
    else callback(null, false)
  },
  credentials: true,
}))
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())
app.use('/uploads', express.static(join(__dirname, '..', 'data', 'uploads')))

// Per-endpoint rate limits
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false })
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `${(req.body?.email || '').toLowerCase()}:${req.ip || req.connection?.remoteAddress || 'unknown'}`, message: { error: 'Too many attempts, try again in 1 minute' } })
const refreshLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down' } })

app.use('/api', globalLimiter)
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/signup', authLimiter)
app.use('/api/auth/refresh', refreshLimiter)

app.use(autoAudit)

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/players', playersRoutes)
app.use('/api/results', resultsRoutes)
app.use('/api/slots', slotsRoutes)
app.use('/api/bookings', actionLimiter, bookingsRoutes)
app.use('/api/imports', importsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/comments', actionLimiter, commentsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/conversion-requests', actionLimiter, conversionRequestsRoutes)
app.use('/api/expenses', expensesRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/booking-requests', actionLimiter, bookingRequestsRoutes)
app.use('/api/payments', actionLimiter, paymentsRoutes)
app.use('/api/audit-logs', auditLogsRoutes)
app.use('/api/admin/import-db', adminImportDbRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/transfers', transfersRoutes)
app.use('/api/guest-booking-requests', guestBookingRequestsRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// 404 JSON handler — never return HTML stack traces
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Global error handler — JSON only, never emit err.stack to clients
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' })
  }
  res.status(500).json({ error: 'Internal server error' })
})

// Ensure admin account exists (non-destructive, safe for hosted deploys)
await ensureAdmin()

// Migration: add account_status column if missing (safe idempotent)
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    const hasCol = await knex.schema.hasColumn('users', 'account_status')
    if (!hasCol) {
      await knex.raw('ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT \'active\'')
      console.log('Migration: added account_status column to users')
    }
  }
} catch (err) {
  console.log('Migration check for account_status skipped:', err.message)
}

// Migration: widen slots.time from VARCHAR(10) to VARCHAR(20) for HH:MM-HH:MM ranges (safe idempotent)
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    const col = await knex.raw("SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'slots' AND column_name = 'time'")
    const maxLen = col.rows?.[0]?.character_maximum_length
    if (maxLen && maxLen < 20) {
      await knex.raw('ALTER TABLE slots ALTER COLUMN time TYPE VARCHAR(20)')
      console.log('Migration: widened slots.time to VARCHAR(20)')
    }
  }
} catch (err) {
  console.log('Migration check for slots.time skipped:', err.message)
}

// Ensure roles table exists and has the 4 system roles (safe idempotent migration)
async function ensureRoles() {
  try {
    if (db.backend === 'pg') {
      const { getKnex } = await import('./sql.js')
      const knex = getKnex()
      const hasTable = await knex.schema.hasTable('roles')
      if (!hasTable) {
        await knex.raw(`
          CREATE TABLE roles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            level INT NOT NULL DEFAULT 1,
            permissions JSONB DEFAULT '[]'::jsonb,
            is_system BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `)
        console.log('ensure-roles: created roles table')
      }
    }
    const existing = await db.findAll('roles')
    if (existing.length === 0) {
      for (const role of SYSTEM_ROLES) {
        await db.insert('roles', { name: role.name, display_name: role.display_name, level: role.level, permissions: role.permissions, is_system: role.is_system })
      }
      console.log('ensure-roles: seeded 4 system roles')
    }
  } catch (err) {
    console.error('ensure-roles: failed (non-fatal):', err.message)
  }
}
await ensureRoles()

app.listen(PORT, () => {
  console.log(`MM Padel Academy API running on http://localhost:${PORT}`)
})
