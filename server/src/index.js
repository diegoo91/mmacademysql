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
import resultsRoutes from './routes/results.js'
import slotsRoutes from './routes/slots.js'
import bookingsRoutes from './routes/bookings.js'
import importsRoutes from './routes/imports.js'
import dashboardRoutes from './routes/dashboard.js'
import commentsRoutes from './routes/comments.js'
import notificationsRoutes from './routes/notifications.js'
import pushRoutes from './routes/push.js'
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
import tournamentsRoutes from './routes/tournaments.js'
import journeyRoutes from './routes/journey.js'
import { ensureAdmin } from './ensure-admin.js'
import { autoAudit } from './middleware/auto-audit.js'
import { SYSTEM_ROLES } from './utils/modules.js'
import db, { loadActorColumns } from './db.js'
import { runWithActor } from './actor.js'

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
// One actor context per request: authenticate() fills it in, db.js reads it
// when stamping created_by/updated_by.
app.use((req, res, next) => runWithActor({ userId: null }, () => next()))
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
app.use('/api/results', resultsRoutes)
app.use('/api/slots', slotsRoutes)
app.use('/api/bookings', actionLimiter, bookingsRoutes)
app.use('/api/imports', importsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/comments', actionLimiter, commentsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/push', pushRoutes)
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
app.use('/api/tournaments', actionLimiter, tournamentsRoutes)
app.use('/api/journey', actionLimiter, journeyRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// Admin-triggered balance cycle sweep (before 404 catch-all)
app.post('/api/balance/rollover', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { verifyAccessToken } = await import('./utils/tokens.js')
    const payload = verifyAccessToken(token)
    if (!payload) return res.status(401).json({ error: 'Unauthorized' })
    const { getUserPermissions } = await import('./middleware/rbac.js')
    const perms = await getUserPermissions(payload)
    if (!perms.includes('dashboard')) return res.status(403).json({ error: 'Insufficient permissions' })
    const { runBalanceCycleSweep } = await import('./utils/cycle.js')
    const result = await runBalanceCycleSweep({ upcomingDays: 3 })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('Balance rollover error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

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

// Migration: drop balance CHECK constraints — app allows negative balances
// (admin "Deduct Anyway" / deductBalanceAllowNegative). >=0 checks caused 500s.
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_private_balance')
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_group_balance')
    console.log('Migration: ensured balance CHECK constraints are dropped')
  }
} catch (err) {
  console.log('Migration check for balance constraints skipped:', err.message)
}

// Migration: monthly cycle balance columns (idempotent)
// cycle_* = new payments (expire ~14th of following month);
// private_balance/group_balance = grandfathered legacy (never expire).
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    const cycleCols = [
      ['cycle_key', "VARCHAR(7)"],
      ['cycle_expires_at', 'TIMESTAMP'],
      ['cycle_private', 'INTEGER DEFAULT 0'],
      ['cycle_group', 'INTEGER DEFAULT 0'],
      ['cycle_private_paid', 'INTEGER DEFAULT 0'],
      ['cycle_group_paid', 'INTEGER DEFAULT 0'],
    ]
    for (const [name, type] of cycleCols) {
      const has = await knex.schema.hasColumn('users', name)
      if (!has) {
        await knex.raw(`ALTER TABLE users ADD COLUMN ${name} ${type}`)
        console.log(`Migration: added users.${name}`)
      }
    }
  }
} catch (err) {
  console.log('Migration check for cycle balance columns skipped:', err.message)
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

// Migration: push_subscriptions table (Web Push) — safe idempotent
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    const hasTable = await knex.schema.hasTable('push_subscriptions')
    if (!hasTable) {
      await knex.schema.createTable('push_subscriptions', (t) => {
        t.increments('id').primary()
        t.integer('user_id').notNullable()
        t.text('endpoint').notNullable().unique()
        t.text('p256dh').notNullable()
        t.text('auth').notNullable()
        t.string('user_agent', 300)
        t.timestamp('created_at').defaultTo(knex.fn.now())
        t.timestamp('updated_at').defaultTo(knex.fn.now())
        t.index(['user_id'])
      })
      console.log('Migration: created push_subscriptions table')
    }
  }
} catch (err) {
  console.log('Migration check for push_subscriptions skipped:', err.message)
}

// Migration: created_by/updated_by parity — coach_daily_hours, coach_payments
// and session_transfers only carry created_by. Safe idempotent.
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    for (const table of ['coach_daily_hours', 'coach_payments', 'session_transfers']) {
      if (await knex.schema.hasTable(table) && !(await knex.schema.hasColumn(table, 'updated_by'))) {
        await knex.schema.alterTable(table, (t) => t.integer('updated_by'))
        console.log(`Migration: added ${table}.updated_by`)
      }
    }
  }
} catch (err) {
  console.log('Migration for updated_by columns skipped:', err.message)
}

// Migration: payment settlement record — what a payment offset from legacy
// debt (settled_*) and what it credited into the cycle (credited_*).
// Nullable (null = pre-settlement row, reversed with legacy semantics). Idempotent.
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    if (await knex.schema.hasTable('payments')) {
      for (const col of ['settled_private', 'settled_group', 'credited_private', 'credited_group']) {
        if (!(await knex.schema.hasColumn('payments', col))) {
          await knex.schema.alterTable('payments', (t) => t.integer(col))
          console.log(`Migration: added payments.${col}`)
        }
      }
    }
  }
} catch (err) {
  console.log('Migration for payments settlement columns skipped:', err.message)
}

// Migration: tournament system — 4 tables + payments.tournament_id + the
// 0-session CHECK. All statements idempotent (IF NOT EXISTS / guarded
// constraint), so boot is safe on fresh and existing local databases.
try {
  if (db.backend === 'pg') {
    const { getKnex } = await import('./sql.js')
    const knex = getKnex()
    await knex.raw(`CREATE TABLE IF NOT EXISTS tournaments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      skill_level VARCHAR(16) NOT NULL,
      format VARCHAR(20) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      bracket_size INT NOT NULL,
      groups_count INT,
      teams_per_group INT,
      advance_per_group INT,
      match_format VARCHAR(20) NOT NULL DEFAULT 'short',
      entry_fee NUMERIC DEFAULT 0,
      count_to_records SMALLINT NOT NULL DEFAULT 0,
      registration_open_at TIMESTAMP,
      registration_close_at TIMESTAMP,
      notes TEXT,
      created_by INT,
      updated_by INT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      CONSTRAINT chk_tournament_skill CHECK (skill_level IN ('Beginners','Low D','D','Low C','C','B','A','Open')),
      CONSTRAINT chk_tournament_format CHECK (format IN ('knockout','groups_knockout')),
      CONSTRAINT chk_tournament_status CHECK (status IN ('draft','registration_open','registration_closed','in_progress','completed','cancelled')),
      CONSTRAINT chk_tournament_bracket_size CHECK (bracket_size IN (4,8,16,32,64)),
      CONSTRAINT chk_tournament_match_format CHECK (match_format IN ('short','long','tiebreak')),
      CONSTRAINT chk_tournament_fee CHECK (entry_fee IS NULL OR entry_fee >= 0)
    )`)
    await knex.raw(`CREATE TABLE IF NOT EXISTS tournament_signups (
      id SERIAL PRIMARY KEY,
      tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      team_name VARCHAR(160),
      player1_id INT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
      player2_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_id INT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      CONSTRAINT chk_signup_status CHECK (status IN ('pending','approved','rejected','withdrawn')),
      CONSTRAINT chk_signup_distinct_players CHECK (player2_id IS NULL OR player2_id <> player1_id)
    )`)
    await knex.raw(`CREATE TABLE IF NOT EXISTS tournament_teams (
      id SERIAL PRIMARY KEY,
      tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      team_name VARCHAR(160) NOT NULL,
      player1_id INT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
      player2_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      seed INT,
      group_label VARCHAR(4),
      source VARCHAR(20) NOT NULL DEFAULT 'signup',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      CONSTRAINT chk_team_status CHECK (status IN ('active','withdrawn','eliminated')),
      CONSTRAINT chk_team_source CHECK (source IN ('signup','admin','paired_solo')),
      CONSTRAINT chk_team_distinct_players CHECK (player2_id IS NULL OR player2_id <> player1_id)
    )`)
    await knex.raw(`CREATE TABLE IF NOT EXISTS tournament_matches (
      id SERIAL PRIMARY KEY,
      tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      phase VARCHAR(20) NOT NULL,
      group_label VARCHAR(4),
      round_no INT NOT NULL DEFAULT 1,
      slot_index INT NOT NULL DEFAULT 0,
      next_match_id INT REFERENCES tournament_matches(id) ON DELETE SET NULL,
      team_a_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
      team_b_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
      format VARCHAR(20),
      score_a INT,
      score_b INT,
      winner_team_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      court INT,
      scheduled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      CONSTRAINT chk_match_phase CHECK (phase IN ('group','knockout')),
      CONSTRAINT chk_match_status CHECK (status IN ('scheduled','completed','bye','tbd')),
      CONSTRAINT chk_match_scores CHECK (
        (score_a IS NULL AND score_b IS NULL)
        OR (score_a >= 0 AND score_b >= 0 AND score_a <> score_b)
      )
    )`)
    await knex.raw('ALTER TABLE payments ADD COLUMN IF NOT EXISTS tournament_id INT REFERENCES tournaments(id) ON DELETE SET NULL')
    // tables created by an earlier boot may predate these columns
    for (const tbl of ['tournament_signups', 'tournament_teams']) {
      await knex.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now()`)
    }
    await knex.raw(`DO $$ BEGIN
      ALTER TABLE payments ADD CONSTRAINT chk_tournament_payment_sessions
        CHECK (tournament_id IS NULL OR (COALESCE(private_sessions,0) = 0 AND COALESCE(group_sessions,0) = 0));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`)
    // updated_at triggers (generic update_timestamp() lives in schema.sql; create
    // it when booting a database that predates tournament tables)
    await knex.raw(`CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$ LANGUAGE plpgsql`)
    for (const tbl of ['tournaments', 'tournament_signups', 'tournament_teams', 'tournament_matches']) {
      await knex.raw(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${tbl}_updated_at_trigger') THEN
          CREATE TRIGGER ${tbl}_updated_at_trigger BEFORE UPDATE ON ${tbl}
            FOR EACH ROW EXECUTE FUNCTION update_timestamp();
        END IF;
      END $$`)
    }
    for (const [ix, ddl] of [
      ['ix_tournaments_status', 'CREATE INDEX IF NOT EXISTS ix_tournaments_status ON tournaments(status)'],
      ['ix_tournaments_skill', 'CREATE INDEX IF NOT EXISTS ix_tournaments_skill ON tournaments(skill_level)'],
      ['ix_tsignups_tournament', 'CREATE INDEX IF NOT EXISTS ix_tsignups_tournament ON tournament_signups(tournament_id)'],
      ['ix_tsignups_player1', 'CREATE INDEX IF NOT EXISTS ix_tsignups_player1 ON tournament_signups(player1_id)'],
      ['ix_tsignups_player2', 'CREATE INDEX IF NOT EXISTS ix_tsignups_player2 ON tournament_signups(player2_id)'],
      ['ix_tteams_tournament', 'CREATE INDEX IF NOT EXISTS ix_tteams_tournament ON tournament_teams(tournament_id)'],
      ['ix_tteams_player1', 'CREATE INDEX IF NOT EXISTS ix_tteams_player1 ON tournament_teams(player1_id)'],
      ['ix_tteams_player2', 'CREATE INDEX IF NOT EXISTS ix_tteams_player2 ON tournament_teams(player2_id)'],
      ['ix_tmatches_tournament', 'CREATE INDEX IF NOT EXISTS ix_tmatches_tournament ON tournament_matches(tournament_id)'],
      ['ix_tmatches_next', 'CREATE INDEX IF NOT EXISTS ix_tmatches_next ON tournament_matches(next_match_id)'],
      ['ix_tmatches_team_a', 'CREATE INDEX IF NOT EXISTS ix_tmatches_team_a ON tournament_matches(team_a_id)'],
      ['ix_tmatches_team_b', 'CREATE INDEX IF NOT EXISTS ix_tmatches_team_b ON tournament_matches(team_b_id)'],
      ['ix_payments_tournament_id', 'CREATE INDEX IF NOT EXISTS ix_payments_tournament_id ON payments(tournament_id)'],
    ]) {
      await knex.raw(ddl)
      void ix
    }
    const tExists = await knex.schema.hasTable('tournaments')
    if (tExists) console.log('Migration: tournament tables ensured')
  }
} catch (err) {
  console.log('Migration for tournament tables skipped:', err.message)
}

// Migration: coaching journey — assessment_templates / journey_reports /
// journey_items + the 33 canonical skill seeds. All statements idempotent,
// so boot is safe on fresh and existing local databases. Registered BEFORE
// loadActorColumns so created_by/updated_by get stamped on journey_reports.
async function ensureJourneyTables() {
  try {
    if (db.backend === 'pg') {
      const { getKnex } = await import('./sql.js')
      const knex = getKnex()
      await knex.raw(`CREATE TABLE IF NOT EXISTS assessment_templates (
        id SERIAL PRIMARY KEY,
        pillar INT NOT NULL,
        section VARCHAR(80) NOT NULL,
        name VARCHAR(120) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        active SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_tpl_pillar CHECK (pillar IN (1, 2, 3, 4)),
        CONSTRAINT chk_tpl_active CHECK (active IN (0, 1))
      )`)
      await knex.raw(`CREATE TABLE IF NOT EXISTS journey_reports (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        kind VARCHAR(10) NOT NULL DEFAULT 'monthly',
        report_number INT NOT NULL DEFAULT 0,
        maximum_reports INT NOT NULL DEFAULT 10,
        report_month VARCHAR(7),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        overall_score NUMERIC(4, 1),
        general_user_comment TEXT,
        general_admin_comment TEXT,
        created_by INT,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP,
        CONSTRAINT chk_journey_kind CHECK (kind IN ('initial', 'monthly')),
        CONSTRAINT chk_journey_status CHECK (status IN ('draft', 'submitted', 'in-review', 'returned', 'reviewed', 'published')),
        CONSTRAINT chk_journey_reports_max CHECK (maximum_reports >= 1),
        CONSTRAINT uq_journey_report UNIQUE (user_id, kind, report_number)
      )`)
      await knex.raw(`CREATE TABLE IF NOT EXISTS journey_items (
        id SERIAL PRIMARY KEY,
        report_id INT NOT NULL REFERENCES journey_reports(id) ON DELETE CASCADE,
        template_id INT NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
        user_score INT,
        user_comment TEXT,
        admin_score INT,
        admin_comment TEXT,
        final_score INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_item_user_score CHECK (user_score IS NULL OR (user_score >= 1 AND user_score <= 10)),
        CONSTRAINT chk_item_admin_score CHECK (admin_score IS NULL OR (admin_score >= 1 AND admin_score <= 10)),
        CONSTRAINT chk_item_final_score CHECK (final_score IS NULL OR (final_score >= 1 AND final_score <= 10)),
        CONSTRAINT uq_journey_item UNIQUE (report_id, template_id)
      )`)
      await knex.raw(`CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = now(); RETURN NEW; END;
        $$ LANGUAGE plpgsql`)
      for (const tbl of ['assessment_templates', 'journey_reports', 'journey_items']) {
        await knex.raw(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${tbl}_updated_at_trigger') THEN
            CREATE TRIGGER ${tbl}_updated_at_trigger BEFORE UPDATE ON ${tbl}
              FOR EACH ROW EXECUTE FUNCTION update_timestamp();
          END IF;
        END $$`)
      }
      for (const ddl of [
        'CREATE INDEX IF NOT EXISTS ix_journey_reports_user ON journey_reports(user_id)',
        'CREATE INDEX IF NOT EXISTS ix_journey_reports_status ON journey_reports(status)',
        'CREATE INDEX IF NOT EXISTS ix_journey_items_report ON journey_items(report_id)',
        'CREATE INDEX IF NOT EXISTS ix_journey_items_template ON journey_items(template_id)',
        'CREATE INDEX IF NOT EXISTS ix_assessment_templates_pillar ON assessment_templates(pillar, sort_order)',
      ]) await knex.raw(ddl)
      if (await knex.schema.hasTable('journey_reports')) console.log('Migration: journey tables ensured')
    }
    // Seed the 33 canonical skills once — both backends.
    const existing = await db.findAll('assessment_templates')
    if (existing.length === 0) {
      const { JOURNEY_TEMPLATES, TEMPLATE_COUNT } = await import('./utils/journey.js')
      for (const tpl of JOURNEY_TEMPLATES) await db.insert('assessment_templates', tpl)
      console.log(`ensure-journey: seeded ${TEMPLATE_COUNT} assessment templates`)
    }
  } catch (err) {
    console.error('ensure-journey: failed (non-fatal):', err.message)
  }
}
await ensureJourneyTables()

// Cache which tables expose created_by/updated_by (information_schema, once).
try {
  const cols = await loadActorColumns()
  const tables = Object.keys(cols)
  console.log(`Actor columns ready: ${tables.length} tables (${tables.join(', ')})`)
} catch (err) {
  console.log('Actor column load skipped:', err.message)
}

// ── Monthly cycle sweep (lazy expiry + upcoming notices) ──────────
try {
  const { runBalanceCycleSweep } = await import('./utils/cycle.js')
  const sweepOnce = async (label) => {
    try {
      const r = await runBalanceCycleSweep({ upcomingDays: 3 })
      if (r.expired || r.upcoming) console.log(`Balance cycle sweep (${label}):`, r)
    } catch (e) {
      console.error(`Balance cycle sweep (${label}) failed:`, e.message)
    }
  }
  await sweepOnce('startup')
  setInterval(() => sweepOnce('interval'), 6 * 60 * 60 * 1000) // every 6h
} catch (err) {
  console.log('Balance cycle sweep init skipped:', err.message)
}

// ── Tournament registration auto-close sweep (startup + every 6h) ──
// Flips expired registration_open → registration_closed so signups close
// themselves at the deadline; the signup endpoint re-checks on every POST.
try {
  const { runTournamentSweep } = await import('./utils/tournamentSweep.js')
  const tSweepOnce = async (label) => {
    try {
      const r = await runTournamentSweep()
      if (r.closed?.length) console.log(`Tournament sweep (${label}): closed ${r.closed.join(', ')}`)
    } catch (e) {
      console.error(`Tournament sweep (${label}) failed:`, e.message)
    }
  }
  await tSweepOnce('startup')
  setInterval(() => tSweepOnce('interval'), 6 * 60 * 60 * 1000) // every 6h
} catch (err) {
  console.log('Tournament sweep init skipped:', err.message)
}

// Admin-triggered rollover endpoint — registered above (before 404 catch-all)

app.listen(PORT, () => {
  console.log(`MM Padel Academy API running on http://localhost:${PORT}`)
})
