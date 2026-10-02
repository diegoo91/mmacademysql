/**
 * PRODUCTION balance reconciliation for Ammar (user 7) + Aley (user 6).
 * Approved by user 2026-09-30. Statements are hard-coded (no external input).
 * Safety: single transaction; any rowcount mismatch => ROLLBACK, no changes.
 *   Ammar: cycle_group 7 -> 1   (8 paid − 7 used)
 *   Aley:  cycle_group 13 -> 2  (14 net credit − 12 used; settlement kept)
 *   slot balance_status 'deducted' aligned so future cancel/edit can't re-deduct.
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
const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
const cfg = {
  host: u.hostname,
  port: Number(u.port) || 6543,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
}

function expect(label, rowCount, want) {
  if (rowCount !== want) throw new Error(`GUARD FAILED: ${label} affected ${rowCount} rows, expected ${want}`)
  console.log(`  OK ${label}: ${rowCount} row(s)`)
}

;(async () => {
  const c = new Client({ ...cfg, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
  await c.connect()
  try {
    const sanity = await c.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")
    if (!sanity.rows[0].ok) throw new Error('safety: public.users not visible — wrong database?')
    console.log(`CONNECTED to ${cfg.host} db=${cfg.database}`)

    await c.query('BEGIN')
    // 1. Ammar balance: 7 -> 1
    let r = await c.query("UPDATE users SET cycle_group = 1 WHERE user_id = 7 AND cycle_group = 7")
    expect('ammar users.cycle_group 7->1', r.rowCount, 1)
    // 2. Ammar slots: 6 ids, 513 already 'deducted' => 5 change
    r = await c.query("UPDATE slots SET balance_status = 'deducted', updated_at = NOW() WHERE id IN (203,214,273,291,513,518) AND balance_status IS DISTINCT FROM 'deducted'")
    expect('ammar slots flagged', r.rowCount, 5)
    // 3. Aley balance: 13 -> 2
    r = await c.query("UPDATE users SET cycle_group = 2 WHERE user_id = 6 AND cycle_group = 13")
    expect('aley users.cycle_group 13->2', r.rowCount, 1)
    // 4. Aley slots: 12 ids; 508 already 'deducted' + 518 set above => 10 change
    r = await c.query("UPDATE slots SET balance_status = 'deducted', updated_at = NOW() WHERE id IN (197,210,224,256,267,227,301,311,488,508,518,583) AND balance_status IS DISTINCT FROM 'deducted'")
    expect('aley slots flagged', r.rowCount, 10)
    // 5. audit trail (style of prior balance.correction rows 895/896)
    r = await c.query(`
      INSERT INTO audit_logs (action, target_type, target_id, timestamp, rec_before, rec_after) VALUES
      ('balance.correction', 'user', '7', now(),
       '{"note":"Pre-fix state (PAY-0023 reconciliation)","cycle_group":7,"paid_grp":8,"used_grp":7}'::jsonb,
       '{"note":"Corrected: 8 paid - 7 used = 1","cycle_group":1}'::jsonb),
      ('balance.correction', 'user', '6', now(),
       '{"note":"Pre-fix state (PAY-0025 reconciliation)","cycle_group":13,"net_credit":14,"used_grp":12}'::jsonb,
       '{"note":"Corrected: 14 net credit - 12 used = 2","cycle_group":2}'::jsonb)
      RETURNING id`)
    expect('audit rows inserted', r.rowCount, 2)
    console.log('  audit ids:', r.rows.map(x => x.id).join(', '))

    await c.query('COMMIT')
    console.log('COMMITTED')
  } catch (e) {
    try { await c.query('ROLLBACK'); console.log('ROLLED BACK — no changes applied') } catch {}
    console.error('FAILED:', e.message)
    await c.end()
    process.exit(1)
  }

  // verification reads
  const v1 = await c.query("SELECT user_id, cycle_group, cycle_group_paid, cycle_private, cycle_private_paid FROM users WHERE user_id IN (6,7) ORDER BY user_id")
  console.log('verify users:', JSON.stringify(v1.rows))
  const v2 = await c.query("SELECT id, balance_status FROM slots WHERE id IN (197,203,210,214,224,227,256,267,273,291,301,311,488,508,513,518,583) ORDER BY id")
  console.log('verify slots:', JSON.stringify(v2.rows))
  await c.end()
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
