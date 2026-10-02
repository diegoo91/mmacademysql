/**
 * PRODUCTION fix — Table A (approved by user 2026-09-30: "do that first").
 * Balance corrections (before → after validated in table), plus slot flags
 * consistent with post-fix accounting:
 *   Ismail (16):      group_balance 1 → 0; slots 287,205 → 'shortfall'
 *                     (expected < 0 → floor hit; no refund on future cancel)
 *   Titos (33):       private_balance 3 → 2; slots 9 → 'deducted'
 *                     (post-fix balance = paid − used exactly; refund-safe)
 *   Youssef Ashraf(66): cycle_private 7 → 6; slots 340,561 → 'deducted'
 * Safety: single tx; any rowcount mismatch => ROLLBACK.
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
  host: u.hostname, port: Number(u.port) || 6543,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
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
    let r
    // 1. Ismail: group_balance 1 -> 0
    r = await c.query("UPDATE users SET group_balance = 0, updated_at = NOW() WHERE user_id = 16 AND group_balance = 1 AND private_balance = 0")
    expect('ismail group_balance 1->0', r.rowCount, 1)
    // 2. Ismail slots → shortfall (played, never charged; floor-0 accounting => no refund)
    r = await c.query("UPDATE slots SET balance_status = 'shortfall', updated_at = NOW() WHERE id IN (287,205) AND balance_status IS NULL")
    expect('ismail slots → shortfall', r.rowCount, 2)
    // 3. Titos: private_balance 3 -> 2 (group_balance = 1 untouched)
    r = await c.query("UPDATE users SET private_balance = 2, updated_at = NOW() WHERE user_id = 33 AND private_balance = 3 AND group_balance = 1")
    expect('titos private_balance 3->2', r.rowCount, 1)
    // 4. Titos slots → deducted (post-fix balance = paid − used; refund-safe)
    r = await c.query("UPDATE slots SET balance_status = 'deducted', updated_at = NOW() WHERE id IN (334,236,241,343,304,485,525,567,577) AND balance_status IS NULL")
    expect('titos slots → deducted', r.rowCount, 9)
    // 5. Youssef Ashraf: cycle_private 7 -> 6
    r = await c.query("UPDATE users SET cycle_private = 6, updated_at = NOW() WHERE user_id = 66 AND cycle_private = 7")
    expect('youssef cycle_private 7->6', r.rowCount, 1)
    // 6. Youssef slots → deducted
    r = await c.query("UPDATE slots SET balance_status = 'deducted', updated_at = NOW() WHERE id IN (340,561) AND balance_status IS NULL")
    expect('youssef slots → deducted', r.rowCount, 2)
    // 7. audit trail
    r = await c.query(`
      INSERT INTO audit_logs (action, target_type, target_id, timestamp, rec_before, rec_after) VALUES
      ('balance.correction', 'user', '16', now(),
       '{"note":"Table A validation fix","group_balance":1,"paid_grp":16,"used":"13G+2P"}'::jsonb,
       '{"note":"16 paid - 17 used floored = 0","group_balance":0}'::jsonb),
      ('balance.correction', 'user', '33', now(),
       '{"note":"Table A validation fix","private_balance":3,"group_balance":1,"paid_pvt":12,"used":"9P+1G"}'::jsonb,
       '{"note":"paid 24eq - used 19eq = 5eq => P2 G1","private_balance":2}'::jsonb),
      ('balance.correction', 'user', '66', now(),
       '{"note":"Table A validation fix","cycle_private":7,"paid_pvt":8,"used_pvt":2}'::jsonb,
       '{"note":"8 paid - 2 used = 6","cycle_private":6}'::jsonb)
      RETURNING id`)
    expect('audit rows inserted', r.rowCount, 3)
    console.log('  audit ids:', r.rows.map(x => x.id).join(', '))

    await c.query('COMMIT')
    console.log('COMMITTED')
  } catch (e) {
    try { await c.query('ROLLBACK'); console.log('ROLLED BACK — no changes applied') } catch {}
    console.error('FAILED:', e.message)
    await c.end()
    process.exit(1)
  }

  const v1 = await c.query("SELECT user_id, name, private_balance, group_balance, cycle_private, cycle_group FROM users WHERE user_id IN (16,33,66) ORDER BY user_id")
  console.log('verify users:', JSON.stringify(v1.rows))
  const v2 = await c.query("SELECT id, balance_status FROM slots WHERE id IN (205,287,334,236,241,343,304,485,525,567,577,340,561) ORDER BY id")
  console.log('verify slots:', JSON.stringify(v2.rows))
  await c.end()
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
