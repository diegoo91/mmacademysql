/**
 * READ-ONLY production diagnostics for Ammar PAY-0023.
 * Connects via Supabase IPv4 pooler endpoints (direct host is IPv6-only here).
 * Guard: only SELECT/WITH/SHOW statements allowed.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = 'D:/SQL/mm-padel-academy mysql'
function parseEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
const rootEnv = parseEnv(path.join(ROOT, '.env'))
const serverEnv = parseEnv(path.join(ROOT, 'server', '.env'))

// Prefer PROD_DATABASE_URL (known-good pooler creds) over root .env DB_PASSWORD
// (root password was rejected by the pooler).
let cfg = null
const prodUrl = serverEnv.PROD_DATABASE_URL || rootEnv.DATABASE_URL
if (prodUrl) {
  const u = new URL(prodUrl)
  cfg = {
    host: u.hostname,
    port: Number(u.port) || 6543,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
  }
} else {
  const REF = (rootEnv.DB_HOST || '').replace(/^db\./, '').replace(/\.supabase\.co$/, '')
  cfg = { host: 'aws-1-eu-west-1.pooler.supabase.com', port: 6543, user: `postgres.${REF}`, password: rootEnv.DB_PASSWORD, database: rootEnv.DB_NAME || 'mmacademy' }
}
if (!cfg.password) { console.error('no password available'); process.exit(2) }

const NAME_LIKE = '%' + (process.argv[2] || 'ammar').replace(/[^a-z0-9 ]/gi, '') + '%'
const ATTEMPTS = [cfg]
// fallback combos: same creds, alternate db/host
ATTEMPTS.push({ ...cfg, database: cfg.database === 'postgres' ? 'mmacademy' : 'postgres' })
ATTEMPTS.push({ ...cfg, host: 'aws-1-eu-west-1.pooler.supabase.com', port: 6543 })

const ALLOW = /^\s*(SELECT|WITH|SHOW)\b/i
async function q(client, sql, label) {
  if (!ALLOW.test(sql)) throw new Error('non-SELECT blocked: ' + sql.slice(0, 60))
  const res = await client.query(sql)
  console.log(`\n### ${label} (${res.rowCount} rows)`)
  for (const r of res.rows) console.log(JSON.stringify(r))
  return res
}

async function tryConnect() {
  const attempts = []
  for (const a of ATTEMPTS) {
    const c = new Client({ ...a, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
    try {
      await c.connect()
      const sanity = await c.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")
      if (!sanity.rows[0].ok) {
        await c.end()
        attempts.push(`${a.host} u=${a.user} db=${a.database}: connected but no public.users table`)
        continue
      }
      const v = await c.query('SHOW server_version')
      console.log(`CONNECTED: ${a.host}:${a.port} user=${a.user} db=${a.database} pg=${v.rows[0].server_version}`)
      return c
    } catch (e) {
      attempts.push(`${a.host} u=${a.user} db=${a.database}: ${e.message}`)
      try { await c.end() } catch {}
    }
  }
  console.error('ALL CONNECTION ATTEMPTS FAILED:')
  for (const at of attempts) console.error('  ' + at)
  return null
}

;(async () => {
  const c = await tryConnect()
  if (!c) process.exit(1)
  try {
    // ---- schema discovery (adapt to missing columns) ----
    const col = async (table) => (await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]
    )).rows.map(r => r.column_name)
    const payCols = await col('payments')
    const slotCols = await col('slots')
    const auditCols = await col('audit_logs')
    const userCols = await col('users')
    console.log('\ncolumns payments:', payCols.join(','))
    console.log('columns slots:', slotCols.join(','))
    console.log('columns audit_logs:', auditCols.join(','))
    console.log('columns users has permissions:', userCols.includes('permissions'))
    const auditNN = (await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs' AND is_nullable='NO' AND column_default IS NULL"
    )).rows.map(r => r.column_name)
    console.log('audit_logs required cols:', auditNN.join(',') || '(none)')
    const has = (cols, n) => cols.includes(n)

    // ---- Q1: Ammar user row ----
    await q(c, `
      SELECT user_id, name, email, role, account_status, private_balance, group_balance,
             cycle_key, cycle_expires_at, cycle_private, cycle_group,
             cycle_private_paid, cycle_group_paid, balance_zero_since, created_at
      FROM users
      WHERE email ILIKE '${NAME_LIKE}' OR name ILIKE '${NAME_LIKE}'
      ORDER BY user_id`, 'Q1: users (Ammar)')

    // ---- Q2: his payments (with settlement cols if present) ----
    const paySel = [
      'id', 'ref', 'date', 'player_name', 'player_id', 'method', 'amount',
      'private_sessions', 'group_sessions', 'status',
      has(payCols, 'credited_private') ? 'credited_private' : 'NULL AS credited_private',
      has(payCols, 'credited_group') ? 'credited_group' : 'NULL AS credited_group',
      has(payCols, 'settled_private') ? 'settled_private' : 'NULL AS settled_private',
      has(payCols, 'settled_group') ? 'settled_group' : 'NULL AS settled_group',
      'notes', 'created_at',
    ].join(', ')
    await q(c, `
      SELECT ${paySel} FROM payments
      WHERE player_name ILIKE '${NAME_LIKE}'
         OR player_id IN (SELECT user_id FROM users WHERE email ILIKE '${NAME_LIKE}' OR name ILIKE '${NAME_LIKE}')
      ORDER BY date, id`, 'Q2: payments (Ammar)')

    // ---- Q3: his slots / usage vs deduction state ----
    const slotSel = ['id', 'date', 'time', 'court', 'player_text', 'session_type', 'status', 'user_id']
      .filter(f => slotCols.includes(f))
      .concat(slotCols.includes('balance_status') ? ['balance_status'] : ['NULL AS balance_status'])
      .concat(slotCols.includes('coach_id') ? ['coach_id'] : [])
      .concat(slotCols.includes('created_at') ? ['created_at'] : [])
      .join(', ')
    await q(c, `
      SELECT ${slotSel} FROM slots
      WHERE player_text ILIKE '${NAME_LIKE}'
      ORDER BY date, id`, 'Q3: slots (Ammar)')

    // ---- Q4: audit trail on his user + payments (if table rich enough) ----
    if (auditCols.includes('target_type') && auditCols.includes('target_id')) {
      const auditSel = ['id', 'action', 'target_type', 'target_id', 'timestamp']
        .filter(f => f === 'id' || f === 'action' || f === 'timestamp' || auditCols.includes(f)).join(', ')
      const extra = auditCols.includes('rec_before') ? ', rec_before, rec_after' : ''
      await q(c, `
        SELECT ${auditSel}${extra} FROM audit_logs
        WHERE (target_type = 'user' AND target_id IN (SELECT user_id::text FROM users WHERE email ILIKE '${NAME_LIKE}' OR name ILIKE '${NAME_LIKE}'))
           OR (target_type = 'payment' AND target_id IN (SELECT id::text FROM payments WHERE player_name ILIKE '${NAME_LIKE}'))
           OR (target_type = 'slot' AND target_id IN (SELECT id::text FROM slots WHERE player_text ILIKE '${NAME_LIKE}' AND balance_status IS NOT NULL))
        ORDER BY id DESC LIMIT 80`, 'Q4: audit_logs (user+payments+deducted slots)')
    } else {
      console.log('\n### Q4 skipped — audit_logs lacks target_type/target_id; columns: ' + auditCols.join(','))
    }
  } finally {
    await c.end()
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })

