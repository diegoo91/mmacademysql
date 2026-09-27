#!/usr/bin/env node
/**
 * Backfill created_by on historical rows from audit_logs `create` entries.
 *
 * Why only created_by: a `create` audit row names a definite author, so the
 * attribution is provable. Historical `updated_by` is NOT derivable — audit
 * rows don't tell us which actor produced the row's current state (balance
 * sweeps, imports and direct DB writes are not all audit-linked), so those
 * stay NULL rather than being guessed. created_by/updated_by are populated
 * automatically on every new write by server/src/db.js applyActorCols().
 *
 * Prod (default):  node scripts/backfill-audit-actors.js           (dry-run)
 *                  node scripts/backfill-audit-actors.js --apply
 * Local pg:        node scripts/backfill-audit-actors.js --local [--apply]
 *
 * Guards: only fills NULL (never overwrites), only rows that still exist,
 * only actor ids present in users, and skips any row whose audit history
 * claims two different authors. A JSON backup of every row changed is written
 * before --apply.
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const require = createRequire(join(ROOT, 'server', 'package.json'))

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LOCAL = args.includes('--local')
const BACKUP_DIR = join(__dirname, 'payments-backups')

// audit_logs.target_type (singular) -> physical table
const TYPE_TO_TABLE = {
  payment: 'payments',
  expense: 'expenses',
  slot: 'slots',
  user: 'users',
  comment: 'comments',
  booking: 'bookings',
  result: 'results',
  coach_daily_hours: 'coach_daily_hours',
  booking_request: 'booking_requests',
  import_batch: 'import_batches',
}

// Physical PK per table (app code always calls it 'id', pg does not always)
const PK = { users: 'user_id' }

function fail(msg) { console.error('ABORT:', msg); process.exit(1) }

const TABLES = [...new Set(Object.values(TYPE_TO_TABLE))]

async function main() {
  const loadDbUrl = () => {
    require('dotenv').config({ path: join(ROOT, 'server', '.env'), quiet: true })
    if (LOCAL) {
      if (process.env.LOCAL_DATABASE_URL) return process.env.LOCAL_DATABASE_URL
      const host = process.env.DB_HOST || 'localhost'
      const port = process.env.DB_PORT || '5432'
      const user = process.env.DB_USER || 'postgres'
      const pass = process.env.DB_PASSWORD || 'root'
      const name = process.env.DB_NAME || 'mmacademy'
      return `postgres://${user}:${pass}@${host}:${port}/${name}`
    }
    return process.env.PROD_DATABASE_URL || process.env.DATABASE_URL
  }

  const url = loadDbUrl()
  if (!url) fail('No database URL (set PROD_DATABASE_URL in server/.env, or use --local)')

  const knex = require('knex')({ client: 'pg', connection: { connectionString: url, ssl: url.includes('supabase') ? { rejectUnauthorized: false } : false } })
  console.log(`Target: ${LOCAL ? 'LOCAL pg' : 'PROD (Supabase)'} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  // Sanity: this is pg and the tables exist
  for (const t of ['audit_logs', ...TABLES]) {
    if (!(await knex.schema.hasTable(t))) fail(`table ${t} missing`)
  }

  const validActors = new Set((await knex.raw('SELECT user_id FROM users')).rows.map(r => r.user_id))
  console.log(`Known actors in users: ${validActors.size}`)

  // ── Step 1: audit_logs self-backfill (audit row's own author) ────────────
  const auditSelf = await knex.raw('SELECT id, actor_id FROM audit_logs WHERE created_by IS NULL AND actor_id IS NOT NULL')
  const selfCandidates = auditSelf.rows.filter(r => validActors.has(r.actor_id))
  const selfUnknown = auditSelf.rows.length - selfCandidates.length

  // ── Step 2: per-table from `create` audit entries ────────────────────────
  const plans = []
  const backups = []

  for (const table of TABLES) {
    const pk = PK[table] || 'id'
    const type = Object.keys(TYPE_TO_TABLE).find(t => TYPE_TO_TABLE[t] === table)

    const creates = await knex.raw(
      `SELECT target_id, actor_id, count(*) AS c
         FROM audit_logs
        WHERE action = 'create' AND target_type = ? AND target_id IS NOT NULL
        GROUP BY target_id, actor_id`,
      [type]
    )

    // Group claims per row id, then keep only unambiguous ones
    const claims = new Map()
    for (const r of creates.rows) {
      if (!validActors.has(r.actor_id)) continue
      const id = Number(r.target_id)
      if (!claims.has(id)) claims.set(id, new Set())
      claims.get(id).add(r.actor_id)
    }
    const unambiguous = new Map()
    const ambiguous = []
    for (const [id, actors] of claims) {
      if (actors.size === 1) unambiguous.set(id, [...actors][0])
      else ambiguous.push(id)
    }

    if (!unambiguous.size) {
      console.log(`  ${table.padEnd(20)} no candidate create rows`)
      continue
    }

    const ids = [...unambiguous.keys()]
    const existing = await knex.raw(
      `SELECT ${pk} AS id, created_by FROM ${table} WHERE ${pk} = ANY(?)`,
      [ids]
    )
    const rows = existing.rows

    const filled = []
    const already = []
    for (const row of rows) {
      if (row.created_by != null) { already.push(row.id); continue }
      filled.push({ id: row.id, actor: unambiguous.get(row.id) })
    }
    const missing = ids.filter(id => !rows.some(r => Number(r.id) === id))

    if (filled.length) {
      const sample = await knex.raw(
        `SELECT ${pk} AS id FROM ${table} WHERE ${pk} = ANY(?) LIMIT 5`,
        [filled.map(f => f.id)]
      )
      backups.push({ table, pk, changes: filled, sampleIds: sample.rows.map(r => r.id) })
    }

    console.log(`  ${table.padEnd(20)} create-claims:${String(ids.length).padStart(4)}  fillable:${String(filled.length).padStart(4)}  already-set:${String(already.length).padStart(4)}  since-deleted:${String(missing.length).padStart(4)}  ambiguous:${String(ambiguous.length).padStart(3)}`)
    plans.push({ table, pk, filled, ambiguous })
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('')
  console.log(`audit_logs self-backfill candidates : ${selfCandidates.length}${selfUnknown ? `  (skipped ${selfUnknown} rows whose actor_id is not a real user)` : ''}`)
  const totalTable = plans.reduce((s, p) => s + p.filled.length, 0)
  console.log(`table created_by candidates         : ${totalTable}`)

  if (!APPLY) {
    console.log('\nDRY-RUN — nothing written. Re-run with --apply to commit these changes.')
    await knex.destroy()
    return
  }

  // ── Backup, then write ───────────────────────────────────────────────────
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(BACKUP_DIR, `created-by-backfill-${ts}.json`)
  writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    target: LOCAL ? 'local' : 'prod',
    audit_logs: selfCandidates.map(r => ({ id: r.id, created_by: null, new_created_by: r.actor_id })),
    tables: plans.map(p => ({ table: p.table, pk: p.pk, changes: p.filled })),
  }, null, 2))
  console.log(`\nBackup written: ${backupPath}`)

  let written = 0
  for (const row of selfCandidates) {
    const n = await knex('audit_logs').where('id', row.id).whereNull('created_by').update('created_by', row.actor_id)
    written += n
  }
  for (const plan of plans) {
    for (const c of plan.filled) {
      const n = await knex(plan.table).where(plan.pk, c.id).whereNull('created_by').update('created_by', c.actor)
      written += n
    }
  }

  console.log(`APPLIED: ${written} row(s) updated.`)
  await knex.destroy()
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1) })
