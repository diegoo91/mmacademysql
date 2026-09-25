#!/usr/bin/env node
/**
 * Phase 1 + 3 — apply the APPROVED balance fixes (slot 213 fix was REJECTED — untouched).
 *
 * Prod (default):  node scripts/apply-balance-fixes.js            (dry-run report)
 *                   node scripts/apply-balance-fixes.js --apply
 *   1. slot 214: 'Ammar Abdelghany / Adham' -> 'Ammar Abd El Ghany / Adham' (text only)
 *   2. slot 216: 'Eyad / Youssef' -> 'Eyad Dawish / Youssef Dawish'
 *        + deduct 1 group from Eyad Dawish (11) and Youssef Dawish (27), balance_status='deducted'
 *   3. delete duplicate user 26 'Youssef' (0 balance, zero payments/bookings/conversions)
 *   4. slot 213 SKIPPED (rejected by user)
 *
 * Local JSON backend: node scripts/apply-balance-fixes.js --local [--apply]
 *   - local slots already have clean names; only duplicate user 26 is removed.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
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
const LOCAL_JSON = join(ROOT, 'server', 'data', 'academy.db.json')

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backupPath = join(BACKUP_DIR, LOCAL ? `academy.db-${ts}.json` : `balance-fixes-${ts}.json`)

const SLOT214_OLD = 'Ammar Abdelghany / Adham'
const SLOT214_NEW = 'Ammar Abd El Ghany / Adham'
const SLOT216_OLD = 'Eyad / Youssef'
const SLOT216_NEW = 'Eyad Dawish / Youssef Dawish'

function fail(msg) {
  console.error('ABORT:', msg)
  process.exit(1)
}

/** Mirror deductBalanceCycle('group') bucket order; returns updates + audit info. */
function planGroupDeduct(u) {
  const now = new Date()
  const expired = u.cycle_expires_at ? new Date(u.cycle_expires_at) < now : false
  let legP = Math.max(0, u.private_balance || 0)
  let legG = Math.max(0, u.group_balance || 0)
  let cycP = expired ? 0 : Math.max(0, u.cycle_private || 0)
  let cycG = expired ? 0 : Math.max(0, u.cycle_group || 0)
  let how = null
  if (cycG > 0) { cycG -= 1; how = 'cycle_group' }
  else if (legG > 0) { legG -= 1; how = 'legacy_group' }
  else if (cycP > 0) { cycP -= 1; cycG += 1; how = 'convert_cycle_private' }
  else if (legP > 0) { legP -= 1; legG += 1; how = 'convert_legacy_private' }
  if (!how) return null
  const updates = { private_balance: legP, group_balance: legG, cycle_private: cycP, cycle_group: cycG }
  updates.balance_zero_since = (legP === 0 && legG === 0 && cycP === 0 && cycG === 0) ? new Date().toISOString() : null
  return { updates, how }
}

const snapUser = u => ({
  user_id: u.user_id ?? u.id, name: u.name, private_balance: u.private_balance, group_balance: u.group_balance,
  cycle_private: u.cycle_private, cycle_group: u.cycle_group, cycle_key: u.cycle_key, cycle_expires_at: u.cycle_expires_at,
  balance_zero_since: u.balance_zero_since,
})
const snapSlot = s => ({ id: s.id, player_text: s.player_text, status: s.status, balance_status: s.balance_status, date: s.date, session_type: s.session_type })

function auditRow(action, targetType, targetId, before, after) {
  return {
    request_id: null,
    timestamp: new Date().toISOString(),
    actor_id: null,
    actor_name: 'balance-fix-script',
    actor_role: 'system',
    ip: '127.0.0.1',
    action,
    target_type: targetType,
    target_id: targetId,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  }
}

async function runProd() {
  const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8')
  const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim()
  if (!url) fail('DATABASE_URL missing in server/.env')
  const { Client } = require('pg')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const q = async (sql, a) => (await client.query(sql, a)).rows
    const one = async (sql, a) => (await client.query(sql, a)).rows[0]

    const slot214 = await one('SELECT * FROM slots WHERE id = 214')
    const slot216 = await one('SELECT * FROM slots WHERE id = 216')
    const slot213 = await one('SELECT id, player_text, status FROM slots WHERE id = 213')
    const u11 = await one('SELECT * FROM users WHERE user_id = 11')
    const u26 = await one('SELECT * FROM users WHERE user_id = 26')
    const u27 = await one('SELECT * FROM users WHERE user_id = 27')

    console.log('=== BEFORE (prod) ===')
    console.log('slot214:', JSON.stringify(snapSlot(slot214)))
    console.log('slot216:', JSON.stringify(snapSlot(slot216)))
    console.log('slot213 (SKIPPED - rejected):', JSON.stringify(slot213))
    console.log('user11 Eyad Dawish:', JSON.stringify(snapUser(u11)))
    console.log('user27 Youssef Dawish:', JSON.stringify(snapUser(u27)))
    console.log('user26 Youssef (to delete):', JSON.stringify(snapUser(u26)))

    // ── validations ────────────────────────────────────────────────
    if (!slot214 || slot214.player_text !== SLOT214_OLD) fail(`slot 214 expected "${SLOT214_OLD}", got "${slot214?.player_text}"`)
    if (!slot216 || slot216.player_text !== SLOT216_OLD) fail(`slot 216 expected "${SLOT216_OLD}", got "${slot216?.player_text}"`)
    if (slot216.status !== 'player_confirmed') fail(`slot 216 status expected player_confirmed, got ${slot216.status}`)
    if (slot216.balance_status != null) fail(`slot 216 balance_status expected null, got ${slot216.balance_status}`)
    if (!u11 || u11.name !== 'Eyad Dawish') fail('user 11 is not Eyad Dawish')
    if (!u27 || u27.name !== 'Youssef Dawish') fail('user 27 is not Youssef Dawish')
    if (!u26 || u26.name !== 'Youssef') fail('user 26 is not bare "Youssef"')
    if ((u26.private_balance || 0) !== 0 || (u26.group_balance || 0) !== 0) fail('user 26 balance not 0/0')
    const payCount = (await q('SELECT count(*)::int AS n FROM payments WHERE player_id = 26'))[0].n
    const convCount = (await q('SELECT count(*)::int AS n FROM conversion_requests WHERE user_id = 26'))[0].n
    const bookCount = (await q('SELECT count(*)::int AS n FROM bookings WHERE user_id = 26'))[0].n
    if (payCount || convCount || bookCount) fail(`user 26 still referenced: payments=${payCount} conversions=${convCount} bookings=${bookCount}`)

    const d11 = planGroupDeduct(u11)
    const d27 = planGroupDeduct(u27)
    if (!d11) fail('Eyad Dawish has no group-deductable credits')
    if (!d27) fail('Youssef Dawish has no group-deductable credits')
    console.log('\nplanned deduct: user11', d11.how, JSON.stringify(d11.updates))
    console.log('planned deduct: user27', d27.how, JSON.stringify(d27.updates))

    if (!APPLY) {
      console.log('\nDRY-RUN only. Re-run with --apply to write (a backup JSON will be saved first).')
      return
    }

    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    writeFileSync(backupPath, JSON.stringify({
      at: new Date().toISOString(), source: 'prod',
      slots: [snapSlot(slot214), snapSlot(slot216), snapSlot(slot213)],
      users: [snapUser(u11), snapUser(u26), snapUser(u27)],
      user26_refs: { payments: payCount, conversions: convCount, bookings: bookCount },
    }, null, 2))
    console.log('\nbackup:', backupPath)

    const audits = []
    await client.query('BEGIN')
    try {
      let r = await client.query(`UPDATE slots SET player_text = $1 WHERE id = 214 AND player_text = $2`, [SLOT214_NEW, SLOT214_OLD])
      if (r.rowCount !== 1) throw new Error(`slot214 update rowCount=${r.rowCount}`)
      audits.push(auditRow('update', 'slot', 214, { player_text: SLOT214_OLD }, { player_text: SLOT214_NEW }))

      r = await client.query(`UPDATE slots SET player_text = $1, balance_status = 'deducted' WHERE id = 216 AND player_text = $2 AND balance_status IS NULL`, [SLOT216_NEW, SLOT216_OLD])
      if (r.rowCount !== 1) throw new Error(`slot216 update rowCount=${r.rowCount}`)
      audits.push(auditRow('update', 'slot', 216, { player_text: SLOT216_OLD, balance_status: null }, { player_text: SLOT216_NEW, balance_status: 'deducted' }))

      for (const [uid, snap, plan] of [[11, snapUser(u11), d11], [27, snapUser(u27), d27]]) {
        const b4 = { private_balance: snap.private_balance, group_balance: snap.group_balance, cycle_private: snap.cycle_private, cycle_group: snap.cycle_group }
        const r2 = await client.query(
          `UPDATE users SET private_balance = $1, group_balance = $2, cycle_private = $3, cycle_group = $4, balance_zero_since = $5
           WHERE user_id = $6 AND private_balance = $7 AND group_balance = $8 AND cycle_private = $9 AND cycle_group = $10`,
          [plan.updates.private_balance, plan.updates.group_balance, plan.updates.cycle_private, plan.updates.cycle_group, plan.updates.balance_zero_since,
           uid, b4.private_balance, b4.group_balance, b4.cycle_private, b4.cycle_group])
        if (r2.rowCount !== 1) throw new Error(`user${uid} deduct rowCount=${r2.rowCount}`)
        audits.push(auditRow('balance.deduct_group_slot_fix', 'user', uid, b4, {
          private_balance: plan.updates.private_balance, group_balance: plan.updates.group_balance,
          cycle_private: plan.updates.cycle_private, cycle_group: plan.updates.cycle_group, how: plan.how, slot: 216,
        }))
      }

      r = await client.query(`DELETE FROM users WHERE user_id = 26 AND name = 'Youssef'`)
      if (r.rowCount !== 1) throw new Error(`user26 delete rowCount=${r.rowCount}`)
      audits.push(auditRow('delete', 'user', 26, { name: u26.name, email: u26.email, role: u26.role, merged_into: 27 }))

      for (const a of audits) {
        const rr = await client.query(
          `INSERT INTO audit_logs (request_id, timestamp, actor_id, actor_name, actor_role, ip, action, target_type, target_id, rec_before, rec_after)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [a.request_id, a.timestamp, a.actor_id, a.actor_name, a.actor_role, a.ip, a.action, a.target_type, String(a.target_id), a.before, a.after])
        if (rr.rowCount !== 1) throw new Error('audit insert failed')
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }

    console.log('\n=== AFTER (prod) ===')
    console.log('slot214:', JSON.stringify(await one('SELECT id, player_text, balance_status FROM slots WHERE id = 214')))
    console.log('slot216:', JSON.stringify(await one('SELECT id, player_text, status, balance_status FROM slots WHERE id = 216')))
    console.log('slot213 (untouched):', JSON.stringify(await one('SELECT id, player_text FROM slots WHERE id = 213')))
    console.log('user11:', JSON.stringify(await one("SELECT user_id, name, private_balance, group_balance FROM users WHERE user_id = 11")))
    console.log('user27:', JSON.stringify(await one("SELECT user_id, name, private_balance, group_balance FROM users WHERE user_id = 27")))
    const gone = await one('SELECT count(*)::int AS n FROM users WHERE user_id = 26')
    console.log('user26 exists:', gone.n === 1 ? 'YES (FAIL)' : 'no (deleted ✓)')
    console.log(`\nAPPLIED: 2 slot renames, 2 group deducts, 1 user merge-delete. Backup: ${backupPath}`)
  } finally {
    await client.end().catch(() => {})
  }
}

async function runLocal() {
  if (!existsSync(LOCAL_JSON)) fail(`local db not found: ${LOCAL_JSON}`)
  const data = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'))
  const u26 = (data.users || []).find(u => u.id === 26)
  const badSlots = (data.slots || []).filter(s => ['Eyad / Youssef', SLOT214_OLD].includes(s.player_text))
  console.log('=== BEFORE (local) ===')
  console.log('local user26:', u26 ? JSON.stringify({ id: u26.id, name: u26.name, priv: u26.private_balance, grp: u26.group_balance }) : 'absent')
  console.log('local slots needing rename:', badSlots.length ? JSON.stringify(badSlots.map(snapSlot)) : 'none (local names already clean)')
  if (!u26) { console.log('nothing to do.'); return }
  if (u26.name !== 'Youssef') fail(`local user 26 is "${u26.name}", expected "Youssef"`)
  if ((u26.private_balance || 0) !== 0 || (u26.group_balance || 0) !== 0) fail('local user 26 balance not 0/0')
  const refs = {
    payments: (data.payments || []).filter(p => p.player_id === 26).length,
    bookings: (data.bookings || []).filter(b => b.user_id === 26).length,
    conversions: (data.conversion_requests || []).filter(c => c.user_id === 26).length,
  }
  if (refs.payments || refs.bookings || refs.conversions) fail(`local user 26 referenced: ${JSON.stringify(refs)}`)

  if (!APPLY) { console.log('\nDRY-RUN only. Re-run with --local --apply to write (file will be backed up first).'); return }

  copyFileSync(LOCAL_JSON, backupPath)
  console.log('backup:', backupPath)

  data.users = data.users.filter(u => u.id !== 26)
  const sample = (data.audit_logs || [])[0] || null
  const maxId = (data.audit_logs || []).reduce((m, a) => Math.max(m, a.id || 0), 0)
  const row = sample
    ? { ...sample, id: maxId + 1, request_id: null, timestamp: new Date().toISOString(), actor_id: null, actor_name: 'balance-fix-script', actor_role: 'system', ip: '127.0.0.1', action: 'delete', target_type: 'user', target_id: 26, before: JSON.stringify({ name: u26.name, email: u26.email, role: u26.role, merged_into: 27 }), after: null, method: null, path: null, status_code: null, duration_ms: null, request_body: null, error: null }
    : auditRow('delete', 'user', 26, { name: u26.name, email: u26.email, merged_into: 27 }, null)
  data.audit_logs = [...(data.audit_logs || []), row]

  writeFileSync(LOCAL_JSON, JSON.stringify(data, null, 2))
  console.log(`APPLIED (local): deleted duplicate user 26. Backup: ${backupPath}`)
  console.log('note: local slots need no rename fixes; no local balance deducts required (no slot-216 equivalent).')
}

if (LOCAL) await runLocal()
else await runProd()
