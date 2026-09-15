import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { authenticate } from './middleware/auth.js'
import { requireRole } from './middleware/rbac.js'

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
import { ensureAdmin } from './ensure-admin.js'

const app = express()
const PORT = process.env.PORT || 5174
const isProd = process.env.NODE_ENV === 'production'

// Trust proxy (required for correct req.ip behind Railway's reverse proxy)
app.set('trust proxy', 1)

// Build allowed origins list dynamically
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
]
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL)

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
app.use('/uploads', express.static(join(__dirname, '..', 'data', 'uploads')))

// Per-endpoint rate limits
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false })
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `${(req.body?.email || '').toLowerCase()}:${req.ip || req.connection?.remoteAddress || 'unknown'}`, message: { error: 'Too many attempts, try again in 1 minute' } })
const refreshLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down' } })

app.use('/api', globalLimiter)
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/signup', authLimiter)
app.use('/api/auth/refresh', refreshLimiter)

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

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// Ensure admin account exists (non-destructive, safe for Railway deploys)
ensureAdmin()

app.listen(PORT, () => {
  console.log(`MM Padel Academy API running on http://localhost:${PORT}`)
})
