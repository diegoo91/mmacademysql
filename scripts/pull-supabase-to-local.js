#!/usr/bin/env node
/**
 * Pull production data: Supabase (source, READ-ONLY) -> local pg (dest, written).
 * Reverse of scripts/migrate-local-pg-to-supabase.js — same-engine copy,
 * no column mapping, IDs preserved, sequences reset.
 *
 *   node scripts/pull-supabase-to-local.js [--dry-run] [--force] [--skip-schema]
 *
 * Source: SUPABASE_URL env, else DATABASE_URL from server/.env (Supabase pooler).
 * Dest (local): LOCAL_PGURL, else LOCAL_PG_HOST/PORT/NAME/USER/PASSWORD
 *               (default localhost:5432/mmacademy/postgres/root).
 *
 * Steps (non-dry-run): guard -> [schema.sql] -> sync missing columns/tables
 *   from source DDL -> TRUNCATE dest -> chunked copy -> count verify -> sequences.
 *
 * Safety: source is never written. Aborts if dest has rows without --force.
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

// ── source: Supabase pooler ────────────────────────────────────────────────
function readServerEnv() {
  try {
    const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env'), 'utf8')
    const out = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
      if (m) out[m[1]] = m[2]
    }
    return out
  } catch { return {} }
}
const SRC_URL = process.env.SUPABASE_URL || readServerEnv().PROD_DATABASE_URL || readServerEnv().DATABASE_URL
if (!SRC_URL) {
  console.error('Missing source: set SUPABASE_URL or DATABASE_URL in server/.env')
  process.exit(1)
}
const srcMasked = SRC_URL.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@')

// ── dest: local pg ─────────────────────────────────────────────────────────
const dstCfg = process.env.LOCAL_PGURL
  ? { connectionString: process.env.LOCAL_PGURL }
  : {
      host: process.env.LOCAL_PG_HOST || 'localhost',
      port: Number(process.env.LOCAL_PG_PORT || 5432),
      database: process.env.LOCAL_PG_NAME || 'mmacademy',
      user: process.env.LOCAL_PG_USER || 'postgres',
      password: process.env.LOCAL_PG_PASSWORD || 'root',
    }

// Parent-first hint used as a tie-breaker; actual order comes from FK graph.
const LOAD_ORDER = [
  'users', 'roles', 'import_batches', 'results', 'bookings', 'slots',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'audit_logs', 'court_defaults',
  'app_sessions', 'refresh_denylist', 'players',
  'coach_daily_hours', 'coach_payments',
]
const PK = { users: 'user_id', app_sessions: 'session_id' }
const pkOf = (t) => PK[t] || 'id'

// child -> parents, read from the source's FK constraints.
async function fkEdges(client) {
  const { rows } = await client.query(
    `SELECT tc.table_name AS child, ccu.table_name AS parent
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.table_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
        AND tc.table_name <> ccu.table_name`
  )
  const edges = new Map()
  for (const r of rows) {
    if (!edges.has(r.child)) edges.set(r.child, new Set())
    edges.get(r.child).add(r.parent)
  }
  return edges
}

// Kahn topological sort, parents before children. Unknown/self references and
// cycles are ignored; LOAD_ORDER breaks ties so repeated runs stay stable.
function topoSort(tables, edges) {
  const known = new Set(tables)
  const rank = new Map(LOAD_ORDER.map((t, i) => [t, i]))
  const pending = new Map()
  const out = []
  const done = new Set()

  for (const t of tables) {
    const parents = [...(edges.get(t) || [])].filter((p) => known.has(p) && p !== t)
    if (!parents.length) { out.push(t); done.add(t) }
    else pending.set(t, parents)
  }
  const rankOf = (t) => (rank.has(t) ? rank.get(t) : LOAD_ORDER.length + tables.indexOf(t))

  while (pending.size) {
    const ready = [...pending.entries()]
      .filter(([, ps]) => ps.every((p) => done.has(p)))
      .map(([t]) => t)
      .sort((a, b) => rankOf(a) - rankOf(b))
    if (!ready.length) {
      const stuck = [...pending.keys()].sort((a, b) => rankOf(a) - rankOf(b))
      console.log(`  WARNING: FK cycle, loading anyway: ${stuck.join(', ')}`)
      ready.push(...stuck)
      pending.clear()
      for (const t of ready) { out.push(t); done.add(t) }
      break
    }
    for (const t of ready) { pending.delete(t); out.push(t); done.add(t) }
  }
  return out
}

// Split SQL on ';' but ignore semicolons inside dollar-quoted function bodies,
// line/block comments and string literals (same as push script).
function splitStatements(sql) {
  const stmts = []
  let cur = '', i = 0, tag = null
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    if (tag !== null) {
      if (c === '$' && sql.startsWith('$' + tag + '$', i)) {
        cur += '$' + tag + '$'
        i += tag.length + 2
        tag = null
        continue
      }
      cur += c
      i++
      continue
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))
      if (m) { tag = m[0].slice(1, -1); cur += m[0]; i += m[0].length; continue }
    }
    if (c === '-' && sql[i + 1] === '-') { const j = sql.indexOf('\n', i); cur += sql.slice(i, j === -1 ? n : i + (j - i)); i = j === -1 ? n : j; continue }
    if (c === '/' && sql[i + 1] === '*') { const j = sql.indexOf('*/', i + 2); const end = j === -1 ? n : j + 2; cur += sql.slice(i, end); i = end; continue }
    if (c === "'") { const j = sql.indexOf("'", i + 1); let k = j; while (k !== -1 && sql[k + 1] === "'") k = sql.indexOf("'", k + 2); const end = k === -1 ? n : k + 1; cur += sql.slice(i, end); i = end; continue }
    if (c === ';') { if (cur.trim()) stmts.push(cur); cur = ''; i++; continue }
    cur += c
    i++
  }
  if (cur.trim()) stmts.push(cur)
  return stmts
}

const src = new Client({ connectionString: SRC_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })
const dst = new Client({ ...dstCfg, connectionTimeoutMillis: 10000 })

async function tableList(client) {
  const { rows } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"
  )
  return rows.map((r) => r.tablename)
}

async function rowCounts(client, tables) {
  const counts = {}
  for (const t of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)
    counts[t] = rows[0].n
  }
  return counts
}

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table]
  )
  return rows
}

function colType(c) {
  const dt = c.data_type
  const len = c.character_maximum_length
  switch (dt) {
    case 'character varying': return len ? `varchar(${len})` : 'varchar'
    case 'character': return len ? `char(${len})` : 'char'
    case 'numeric': return c.numeric_precision ? `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})` : 'numeric'
    case 'ARRAY': return `${c.udt_name}[]`
    default: return dt
  }
}

async function primaryKeyOf(client, table) {
  const { rows } = await client.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table]
  )
  return rows.map((r) => r.column_name)
}

function quoteIdent(s) { return `"${String(s).replace(/"/g, '""')}"` }

async function syncSchema() {
  const srcTables = await tableList(src)
  const dstTables = new Set(await tableList(dst))
  const created = []
  const added = []

  for (const t of srcTables) {
    const srcCols = await columnsOf(src, t)

    if (!dstTables.has(t)) {
      const pk = await primaryKeyOf(src, t)
      const defs = srcCols.map((c) => {
        let line = `${quoteIdent(c.column_name)} ${colType(c)}`
        if (c.column_default && !/^nextval\(/.test(c.column_default)) line += ` DEFAULT ${c.column_default}`
        if (c.is_nullable === 'NO') line += ' NOT NULL'
        return line
      })
      if (pk.length) defs.push(`PRIMARY KEY (${pk.map(quoteIdent).join(', ')})`)
      await dst.query(`CREATE TABLE ${quoteIdent(t)} (${defs.join(', ')})`)
      created.push(t)
      continue
    }

    const dstCols = new Set((await columnsOf(dst, t)).map((c) => c.column_name))
    for (const c of srcCols) {
      if (dstCols.has(c.column_name)) continue
      let stmt = `ALTER TABLE ${quoteIdent(t)} ADD COLUMN ${quoteIdent(c.column_name)} ${colType(c)}`
      if (c.column_default && !/^nextval\(/.test(c.column_default)) stmt += ` DEFAULT ${c.column_default}`
      await dst.query(stmt)
      added.push(`${t}.${c.column_name}`)
    }
  }
  return { created, added }
}

async function main() {
  await src.connect()
  await dst.connect()

  const srcTables = await tableList(src)
  const dstTables = await tableList(dst)

  const tables = topoSort(
    [
      ...LOAD_ORDER.filter((t) => srcTables.includes(t)),
      ...srcTables.filter((t) => !LOAD_ORDER.includes(t)),
    ],
    await fkEdges(src)
  )

  console.log(`Source : Supabase ${srcMasked.replace(/^postgresql:\/\//, '')}`)
  console.log(`Dest   : ${dstCfg.connectionString ? dstCfg.connectionString.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@') : `${dstCfg.host}:${dstCfg.port}/${dstCfg.database}`}`)
  console.log(`Tables : ${tables.length}`)

  const srcCounts = await rowCounts(src, tables)
  const srcTotal = Object.values(srcCounts).reduce((a, b) => a + b, 0)
  console.log(`Source rows: ${srcTotal}`)
  for (const t of tables) console.log(`  src ${t}: ${srcCounts[t]}`)

  const present = tables.filter((t) => dstTables.includes(t))
  const dstCounts = await rowCounts(dst, present)
  const dstTotal = Object.values(dstCounts).reduce((a, b) => a + b, 0)
  console.log(`Dest rows (existing tables): ${dstTotal}`)
  for (const t of present) console.log(`  dst ${t}: ${dstCounts[t]}${dstCounts[t] !== srcCounts[t] ? `  (src ${srcCounts[t]})` : ''}`)

  // Schema drift report
  const missingTables = tables.filter((t) => !dstTables.includes(t))
  const missingCols = []
  for (const t of tables.filter((x) => dstTables.includes(x))) {
    const s = new Set((await columnsOf(src, t)).map((c) => c.column_name))
    const d = new Set((await columnsOf(dst, t)).map((c) => c.column_name))
    for (const c of s) if (!d.has(c)) missingCols.push(`${t}.${c}`)
  }
  if (missingTables.length) console.log(`Missing tables in dest: ${missingTables.join(', ')}`)
  if (missingCols.length) console.log(`Missing columns in dest: ${missingCols.join(', ')}`)
  if (!missingTables.length && !missingCols.length) console.log('Schema: dest already matches source')

  if (DRY_RUN) {
    console.log('\nMode: --dry-run (no writes)')
    await src.end(); await dst.end()
    return
  }

  if (dstTotal > 0 && !FORCE) {
    console.error('Dest is not empty. Re-run with --force to overwrite, or --dry-run to inspect.')
    process.exit(1)
  }

  if (!SKIP_SCHEMA) {
    console.log('Applying server/schema.sql to dest...')
    const dir = dirname(fileURLToPath(import.meta.url))
    const schema = readFileSync(join(dir, '..', 'server', 'schema.sql'), 'utf-8')
    const stmts = splitStatements(schema)
    console.log(`  ${stmts.length} statements`)
    for (const s of stmts) await dst.query(s)
    console.log('  schema applied')
  }

  console.log('Syncing missing tables/columns from source DDL...')
  const sync = await syncSchema()
  if (sync.created.length) console.log(`  created tables: ${sync.created.join(', ')}`)
  if (sync.added.length) console.log(`  added columns: ${sync.added.join(', ')}`)
  if (!sync.created.length && !sync.added.length) console.log('  nothing to sync')

  console.log('Truncating dest tables...')
  const nowDst = new Set(await tableList(dst))
  const trunc = tables.filter((t) => nowDst.has(t))
  await dst.query(`TRUNCATE ${trunc.map(quoteIdent).join(', ')} CASCADE`)

  console.log('Copying rows...')
  const mismatches = []
  for (const t of tables) {
    const n = srcCounts[t]
    if (!n) { console.log(`  ${t}: 0 rows (skipped)`); continue }
    const { rows } = await src.query(`SELECT * FROM ${quoteIdent(t)}`)
    const dcolRows = await columnsOf(dst, t)
    const dcols = new Map(dcolRows.map((c) => [c.column_name, c.data_type]))
    const jsonCols = new Set(dcolRows.filter((c) => c.data_type === 'json' || c.data_type === 'jsonb').map((c) => c.column_name))
    const cols = Object.keys(rows[0]).filter((c) => dcols.has(c))
    const skipped = Object.keys(rows[0]).filter((c) => !dcols.has(c))
    if (skipped.length) console.log(`  ${t}: skipping columns missing in dest: ${skipped.join(', ')}`)
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const ph = chunk.map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`).join(', ')
      const vals = chunk.flatMap((r) => cols.map((c) => {
        let v = r[c] === undefined ? null : r[c]
        // node-pg serializes JS arrays as pg array literals; json/jsonb needs JSON text
        if (v !== null && jsonCols.has(c)) v = JSON.stringify(v)
        return v
      }))
      await dst.query(`INSERT INTO ${quoteIdent(t)} (${cols.map(quoteIdent).join(', ')}) VALUES ${ph}`, vals)
    }
    const { rows: [{ count }] } = await dst.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(t)}`)
    const ok = count === n
    console.log(`  ${t}: ${count} rows ${ok ? 'ok' : `MISMATCH (src=${n})`}`)
    if (!ok) mismatches.push(t)
  }

  console.log('Resetting sequences...')
  for (const t of tables) {
    const pk = pkOf(t)
    try {
      await dst.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quoteIdent(pk)}) FROM ${quoteIdent(t)}), 1))`,
        [t, pk]
      )
    } catch (e) { console.log(`  ${t}: no sequence (${e.message.slice(0, 80)})`) }
  }

  await src.end()
  await dst.end()

  if (mismatches.length) { console.error('MISMATCHES: ' + mismatches.join(', ')); process.exit(1) }
  console.log(`Done. ${srcTotal} rows pulled from Supabase into local ${dstCfg.database}.`)
}

main().catch((err) => { console.error('Pull failed:', err.message); process.exit(1) })
