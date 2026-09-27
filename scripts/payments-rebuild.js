#!/usr/bin/env node
/**
 * Post-delete phase: purge audit rows + rebuild player balances.
 *
 * Sources:
 *   --source=prod   Supabase (pooler) using server/.env DATABASE_URL  [default: prod for purge]
 *   --source=local  server/data/academy.db.json JSON backend
 *
 * Modes:
 *   node scripts/payments-rebuild.js --source=prod --purge-audit --delete-ids=45,47 --actor-user-id=25 [--report]
 *   node scripts/payments-rebuild.js --source=prod --report
 *   node scripts/payments-rebuild.js --source=prod --apply
 *   node scripts/payments-rebuild.js --source=local --report / --apply
 *
 * Rebuild rule (operator-approved): for every player,
 *   paid  = sum(sessions of KEPT payment_approved payments)
 *   used  = FIFO consumption by slots (conversion identical to server/src/utils/sessionPaid.js)
 *   remaining = paid - consumed (per bucket, conversion-aware), floor 0
 * Stored in legacy buckets: private_balance / group_balance, cycle_* cleared.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const require = createRequire(join(ROOT, 'server', 'package.json'))

const args = process.argv.slice(2)
const getArg = (n, d = null) => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const hasFlag = n => args.includes(`--${n}`)
const SOURCE = getArg('source', hasFlag('purge-audit') ? 'prod' : 'local')
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const LOCAL_JSON = join(ROOT, 'server', 'data', 'academy.db.json')
const BACKUP_DIR = join(__dirname, 'payments-backups')

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const dstr = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '')

let client = null
async function pgConnect() {
  const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8')
  const DATABASE_URL = env.match(/^PROD_DATABASE_URL=(.*)$/m)?.[1]?.trim() || env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim()
  if (!DATABASE_URL) { console.error('PROD_DATABASE_URL (or DATABASE_URL) missing in server/.env'); process.exit(1) }
  const { Client } = require('pg')
  client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
}

// ── purge audit ────────────────────────────────────────────────────
async function purgeAudit() {
  if (SOURCE !== 'prod') { console.error('--purge-audit only supports --source=prod (local has no deleted-payment audit rows)'); process.exit(1) }
  await pgConnect()
  const ids = (getArg('delete-ids') || '').split(',').map(s => parseInt(s.trim())).filter(Boolean)
  const idTexts = ids.map(String)
  const userId = parseInt(getArg('actor-user-id') || '0')
  if (!ids.length) { console.error('--purge-audit requires --delete-ids=45,47'); process.exit(1) }

  const before = await client.query(
    `SELECT id, action, target_type, target_id FROM audit_logs
     WHERE (target_type = 'payment' AND target_id = ANY($1::text[]))
        OR (target_type = 'user' AND target_id = $2::text
            AND (action LIKE 'balance.payment.%' OR action LIKE 'payment.%'))
     ORDER BY id`, [idTexts, userId ? String(userId) : null])
  console.log(`audit rows matched: ${before.rowCount}`)
  for (const r of before.rows) console.log(`  id=${r.id} ${r.action} target=${r.target_type}/${r.target_id}`)

  if (hasFlag('report')) { console.log('(dry-run, not deleting)'); return }
  const res = await client.query(
    `DELETE FROM audit_logs
     WHERE (target_type = 'payment' AND target_id = ANY($1::text[]))
        OR (target_type = 'user' AND target_id = $2::text
            AND (action LIKE 'balance.payment.%' OR action LIKE 'payment.%'))
     RETURNING id`, [idTexts, userId ? String(userId) : null])
  console.log(`purged ${res.rowCount} audit rows`)
}

// ── shared FIFO math ───────────────────────────────────────────────
function computeReport(users, pays, slots) {
  const byPlayerPay = new Map()
  for (const p of pays) {
    if (p.player_id == null) continue
    if (!byPlayerPay.has(p.player_id)) byPlayerPay.set(p.player_id, [])
    byPlayerPay.get(p.player_id).push(p)
  }

  const report = []
  for (const u of users) {
    const myPays = (byPlayerPay.get(u.id) || []).sort((a, b) => dstr(a.date).localeCompare(dstr(b.date)))
    let poolPriv = 0, poolGrp = 0
    for (const p of myPays) { poolPriv += p.private_sessions || 0; poolGrp += p.group_sessions || 0 }

    const mySlots = slots
      .filter(s => { if (!s.player_text) return false; return s.player_text.split(/[/+]/).map(n => norm(n)).includes(norm(u.name)) })
      .sort((a, b) => dstr(a.date).localeCompare(dstr(b.date)) || String(a.time || '').localeCompare(String(b.time || '')))

    // FIFO consumption identical to sessionPaid.js
    for (const s of mySlots) {
      const t = s.session_type || 'private'
      if (t === 'private') {
        if (poolPriv > 0) poolPriv--
        else if (poolGrp >= 2) poolGrp -= 2
      } else {
        if (poolGrp > 0) poolGrp--
        else if (poolPriv > 0) { poolPriv--; poolGrp += 1 }
      }
    }

    const before = {
      private_balance: Number(u.private_balance) || 0,
      group_balance: Number(u.group_balance) || 0,
      cycle_private: Number(u.cycle_private) || 0,
      cycle_group: Number(u.cycle_group) || 0,
    }
    const after = { private_balance: poolPriv, group_balance: poolGrp, cycle_private: 0, cycle_group: 0 }
    const changed = before.private_balance !== after.private_balance || before.group_balance !== after.group_balance || before.cycle_private !== 0 || before.cycle_group !== 0
    report.push({ id: u.id, name: u.name, paidSlots: myPays.length, consumedSlots: mySlots.length, before, after, changed })
  }
  return report
}

function printAndBackup(report) {
  for (const r of report) {
    if (!r.changed) continue
    console.log(`id=${r.id} ${r.name}: paid=${r.paidSlots} slots=${r.consumedSlots} | legacy ${r.before.private_balance}/${r.before.group_balance} + cycle ${r.before.cycle_private}/${r.before.cycle_group} -> new ${r.after.private_balance}/${r.after.group_balance}`)
  }
  const unchanged = report.filter(r => !r.changed).length
  console.log(`\nplayers: ${report.length} | changed: ${report.length - unchanged} | unchanged: ${unchanged}`)

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const backupPath = join(BACKUP_DIR, `balances-${SOURCE}-before-${TS}.json`)
  writeFileSync(backupPath, JSON.stringify(report, null, 2))
  console.log(`balance backup: ${backupPath}`)
}

// ── balance rebuild ────────────────────────────────────────────────
async function rebuild() {
  if (SOURCE === 'local') {
    const data = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'))
    const users = (data.users || []).filter(u => u.role === 'player')
    const pays = (data.payments || []).filter(p => p.status === 'payment_approved')
    const slots = data.slots || []
    const report = computeReport(users, pays, slots)
    printAndBackup(report)
    if (!hasFlag('apply')) { console.log('(dry-run — pass --apply to write)'); return }
    const byId = new Map((data.users || []).map(u => [u.id, u]))
    for (const r of report.filter(x => x.changed)) {
      const u = byId.get(r.id)
      u.private_balance = r.after.private_balance
      u.group_balance = r.after.group_balance
      u.balance_zero_since = (r.after.private_balance === 0 && r.after.group_balance === 0) ? new Date().toISOString() : null
      u.updated_at = new Date().toISOString()
    }
    writeFileSync(LOCAL_JSON, JSON.stringify(data, null, 2))
    console.log(`applied ${report.filter(x => x.changed).length} balance updates (local JSON)`)
    return
  }

  await pgConnect()
  const users = (await client.query(
    `SELECT user_id AS id, name, role, private_balance, group_balance,
            cycle_private, cycle_group, cycle_private_paid, cycle_group_paid,
            cycle_key, cycle_expires_at, balance_zero_since
     FROM users WHERE role = 'player'`)).rows
  // kept approved payments (delete already done — table only has kept rows now)
  const pays = (await client.query(
    `SELECT id, player_id, private_sessions, group_sessions, status, date
     FROM payments WHERE status = 'payment_approved' AND player_id IS NOT NULL`)).rows
  const slots = (await client.query(
    `SELECT id, player_text, session_type, date, time, status FROM slots`)).rows

  const report = computeReport(users, pays, slots)
  printAndBackup(report)

  if (!hasFlag('apply')) { console.log('(dry-run — pass --apply to write)'); return }

  for (const r of report.filter(x => x.changed)) {
    await client.query(
      `UPDATE users SET private_balance=$1, group_balance=$2, cycle_private=0, cycle_group=0,
              cycle_private_paid=0, cycle_group_paid=0, cycle_key=NULL, cycle_expires_at=NULL,
              balance_zero_since = CASE WHEN $1=0 AND $2=0 THEN NOW() ELSE NULL END,
              updated_at = NOW()
       WHERE user_id=$3`, [r.after.private_balance, r.after.group_balance, r.id])
  }
  console.log(`applied ${report.filter(x => x.changed).length} balance updates`)
}

try {
  if (hasFlag('purge-audit')) await purgeAudit()
  else await rebuild()
} finally {
  if (client) await client.end().catch(() => {})
}
