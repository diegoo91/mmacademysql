#!/usr/bin/env node
/**
 * Copy local PostgreSQL (mmacademy) -> Supabase Postgres.
 * Same-engine copy: no column mapping, IDs preserved, sequences reset.
 *
 *   SUPABASE_URL='postgresql://postgres:<pw>@<host>:5432/postgres' \
 *     node scripts/migrate-local-pg-to-supabase.js [--dry-run] [--force] [--skip-schema]
 *
 * Source (local dev defaults, override with env):
 *   LOCAL_PGURL or LOCAL_PG_HOST/PORT/NAME/USER/PASSWORD (default localhost:5432/mmacademy/postgres/root)
 *
 * Safety: aborts if destination has rows unless --force is passed.
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'server', 'package.json'))
const { Client } = require('pg')

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const FORCE = args.has('--force')
const SKIP_SCHEMA = args.has('--skip-schema')

const SUPABASE_URL = process.env.SUPABASE_URL
if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL env var (full postgres connection string).')
  process.exit(1)
}

const srcCfg = process.env.LOCAL_PGURL
  ? { connectionString: process.env.LOCAL_PGURL }
  : {
      host: process.env.LOCAL_PG_HOST || 'localhost',
      port: Number(process.env.LOCAL_PG_PORT || 5432),
      database: process.env.LOCAL_PG_NAME || 'mmacademy',
      user: process.env.LOCAL_PG_USER || 'postgres',
      password: process.env.LOCAL_PG_PASSWORD || 'root',
    }

// Parents first so FKs stay satisfied on load.
const LOAD_ORDER = [
  'users', 'roles', 'import_batches', 'results', 'bookings', 'slots',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'audit_logs', 'court_defaults',
  'app_sessions', 'refresh_denylist', 'players',
  'coach_daily_hours', 'coach_payments',
]
const PK = { users: 'user_id', app_sessions: 'session_id' }
const pkOf = (t) => PK[t] || 'id'

// Split SQL on ';' but ignore semicolons inside dollar-quoted function bodies ($$...$$ / $tag$...$tag$)
// and inside line/block comments and string literals.
function splitStatements(sql) {
  const stmts = []
  let cur = '', i = 0, tag = null
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    if (tag) {
      cur += c
      if (c === '$' && sql.startsWith(tag + '$', i)) { cur += tag + '$'; i += tag.length + 1; tag = null }
      i++
      continue
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))
      if (m) { tag = m[0].slice(1, -1); cur += m[0]; i += m[0].length; continue }
    }
    if (c === '-' && sql[i + 1] === '-') { const j = sql.indexOf('\n', i); cur += sql.slice(i, j === -1 ? n : j); i = j === -1 ? n : j; continue }
    if (c === '/' && sql[i + 1] === '*') { const j = sql.indexOf('*/', i + 2); const end = j === -1 ? n : j + 2; cur += sql.slice(i, end); i = end; continue }
    if (c === "'") { const j = sql.indexOf("'", i + 1); let k = j; while (k !== -1 && sql[k + 1] === "'") k = sql.indexOf("'", k + 2); const end = k === -1 ? n : k + 1; cur += sql.slice(i, end); i = end; continue }
    if (c === ';') { if (cur.trim()) stmts.push(cur); cur = ''; i++; continue }
    cur += c
    i++
  }
  if (cur.trim()) stmts.push(cur)
  return stmts
}

function toPgValue(v) {
  if (v === undefined) return null
  if (Buffer.isBuffer(v)) return null
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v)
  return v
}

const src = new Client({ ...srcCfg, connectionTimeoutMillis: 10000 })
const dst = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })

async function main() {
  await src.connect()
  await dst.connect()

  const { rows: dtables } = await dst.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"
  )
  const destTables = new Set(dtables.map((r) => r.tablename))

  // Tables present in source, restricted to our known order + any extras.
  const { rows: stables } = await src.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"
  )
  const srcTables = stables.map((r) => r.tablename)
  const tables = [
    ...LOAD_ORDER.filter((t) => srcTables.includes(t)),
    ...srcTables.filter((t) => !LOAD_ORDER.includes(t)),
  ]
  console.log('Source tables: ' + tables.map((t) => `${t}`).join(', '))

  const counts = {}
  for (const t of tables) {
    const { rows } = await src.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)
    counts[t] = rows[0].n
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log('Source rows: ' + total)
  for (const t of tables) console.log(`  src ${t}: ${counts[t]}`)

  if (DRY_RUN) console.log('Mode: --dry-run (no writes)')

  // Destination emptiness guard.
  let destTotal = 0
  for (const t of tables) {
    if (!destTables.has(t)) continue
    const { rows } = await dst.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)
    destTotal += rows[0].n
  }
  console.log(`Destination rows in known tables: ${destTotal}`)
  if (destTotal > 0 && !FORCE && !DRY_RUN) {
    console.error('Destination is not empty. Re-run with --force to truncate + reload, or --dry-run to inspect.')
    process.exit(1)
  }

  if (!DRY_RUN) {
    if (!SKIP_SCHEMA) {
      console.log('Applying server/schema.sql...')
      const dir = dirname(fileURLToPath(import.meta.url))
      const schema = readFileSync(join(dir, '..', 'server', 'schema.sql'), 'utf-8')
      const stmts = splitStatements(schema)
      console.log(`  ${stmts.length} statements`)
      for (const s of stmts) await dst.query(s)
      console.log('  schema applied')
    }
    console.log('Truncating destination tables...')
    const existing = tables.filter((t) => (await dst.query('SELECT 1 FROM pg_tables WHERE schemaname=$1 AND tablename=$2', ['public', t])).rows.length)
    if (existing.length) await dst.query(`TRUNCATE ${existing.map((t) => `"${t}"`).join(', ')} CASCADE`)

    console.log('Copying rows...')
    const mismatches = []
    for (const t of tables) {
      const n = counts[t]
      if (!n) { console.log(`  ${t}: 0 rows (skipped)`); continue }
      const { rows } = await src.query(`SELECT * FROM "${t}"`)
      const cols = Object.keys(rows[0])
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const ph = chunk.map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`).join(', ')
        const vals = chunk.flatMap((r) => cols.map((c) => toPgValue(r[c])))
        await dst.query(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${ph}`, vals)
      }
      const { rows: [{ count }] } = await dst.query(`SELECT COUNT(*)::int AS count FROM "${t}"`)
      const ok = count === n
      console.log(`  ${t}: ${count} rows ${ok ? 'ok' : `MISMATCH (src=${n})`}`)
      if (!ok) mismatches.push(t)
    }

    console.log('Resetting sequences...')
    for (const t of tables) {
      const pk = pkOf(t)
      try {
        await dst.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX("${pk}") FROM "${t}"), 1))`,
          [t, pk]
        )
      } catch (e) { console.log(`  ${t}: no sequence (${e.message.slice(0, 80)})`) }
    }
    if (mismatches.length) { console.error('MISMATCHES: ' + mismatches.join(', ')); process.exit(1) }
    console.log(`Done. ${total} rows loaded into Supabase.`)
  }

  await src.end()
  await dst.end()
}

main().catch((err) => { console.error('Migration failed:', err.message); process.exit(1) })
