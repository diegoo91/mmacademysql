#!/usr/bin/env node
/**
 * Phase 0 — READ-ONLY balance audit against prod Postgres (SELECT only).
 *
 * Usage:
 *   node scripts/balance-audit.js            human-readable report
 *   node scripts/balance-audit.js --json     also writes scripts/payments-backups/balance-audit-<ts>.json
 *   node scripts/balance-audit.js --filter=titos   only players/slots matching substring
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
const FILTER = getArg('filter', null)

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const dstr = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || ''))

let client = null
async function pgConnect() {
  const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8')
  const DATABASE_URL = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim()
  if (!DATABASE_URL) { console.error('DATABASE_URL missing in server/.env'); process.exit(1) }
  const { Client } = require('pg')
  client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
}

const expired = u => !!u.cycle_expires_at && new Date(u.cycle_expires_at.replace(' ', 'T') + 'Z') < new Date()

/** FIFO expected remaining from paid credits vs a given slot set (same conversion rules as sessionPaid.js). */
function fifo(paidPriv, paidGrp, slotList) {
  let p = paidPriv, g = paidGrp
  const sorted = [...slotList].sort((a, b) => dstr(a.date).localeCompare(dstr(b.date)) || String(a.time || '').localeCompare(String(b.time || '')))
  for (const s of sorted) {
    const t = s.session_type || 'private'
    if (t === 'private') {
      if (p > 0) p--
      else if (g >= 2) g -= 2
    } else {
      if (g > 0) g--
      else if (p > 0) { p--; g += 1 }
    }
  }
  return { priv: p, grp: g }
}

async function audit() {
  await pgConnect()

  const players = (await client.query(
    `SELECT user_id AS id, name, email, role, private_balance, group_balance,
            cycle_private, cycle_group, cycle_private_paid, cycle_group_paid,
            cycle_key, cycle_expires_at, balance_zero_since
     FROM users WHERE role = 'player' ORDER BY user_id`)).rows
  const allUsers = (await client.query(`SELECT user_id AS id, name, role FROM users`)).rows
  const pays = (await client.query(
    `SELECT id, player_id, player_name, private_sessions, group_sessions, status, amount, date, method
     FROM payments`)).rows
  const slots = (await client.query(
    `SELECT id, player_text, session_type, status, balance_status, date, time, court, booking_id
     FROM slots`)).rows

  const approvedPays = pays.filter(p => p.status === 'payment_approved')
  const payByPlayer = new Map()
  for (const p of approvedPays) {
    if (p.player_id == null) continue
    if (!payByPlayer.has(p.player_id)) payByPlayer.set(p.player_id, [])
    payByPlayer.get(p.player_id).push(p)
  }

  const playerNormNames = new Map(players.map(u => [norm(u.name), u]))
  const segOwners = new Map() // normalized slot segment -> { count, slots: [] }
  for (const s of slots) {
    for (const raw of String(s.player_text || '').split(/[/+]/)) {
      const seg = norm(raw)
      if (!seg) continue
      if (!segOwners.has(seg)) segOwners.set(seg, { count: 0, slots: [] })
      const e = segOwners.get(seg)
      e.count++
      e.slots.push(s)
    }
  }

  const rows = []
  for (const u of players) {
    if (FILTER && !norm(u.name).includes(FILTER)) continue

    const myPays = payByPlayer.get(u.id) || []
    const paidPriv = myPays.reduce((s, p) => s + (p.private_sessions || 0), 0)
    const paidGrp = myPays.reduce((s, p) => s + (p.group_sessions || 0), 0)

    const mySlots = slots.filter(s => String(s.player_text || '').split(/[/+]/).map(n => norm(n)).includes(norm(u.name)))
    const confirmed = mySlots.filter(s => s.status === 'player_confirmed')
    const deducted = mySlots.filter(s => s.balance_status === 'deducted')
    const confirmedNotDeducted = confirmed.filter(s => s.balance_status !== 'deducted')

    const exp = expired(u)
    const legP = Number(u.private_balance) || 0
    const legG = Number(u.group_balance) || 0
    const cycP = exp ? 0 : (Number(u.cycle_private) || 0)
    const cycG = exp ? 0 : (Number(u.cycle_group) || 0)
    const effP = legP + cycP
    const effGrpReal = legG + cycG
    const effGrpDisplay = effGrpReal + effP * 2
    const remainingNow = effP + effGrpDisplay
    const remainingNew = effP + effGrpReal

    const fifoAll = fifo(paidPriv, paidGrp, mySlots)
    const fifoDeducted = fifo(paidPriv, paidGrp, deducted)

    const flags = []
    if (effP !== fifoDeducted.priv || effGrpReal !== fifoDeducted.grp) flags.push('vs-deducted-FIFO')
    if (effP !== fifoAll.priv || effGrpReal !== fifoAll.grp) flags.push('vs-allSlots-FIFO')
    if (confirmedNotDeducted.length) flags.push(`never-deducted:${confirmedNotDeducted.length}`)
    if (exp && ((Number(u.cycle_private) || 0) > 0 || (Number(u.cycle_group) || 0) > 0)) flags.push('expired-cycle-not-cleared')
    if (paidPriv + paidGrp === 0 && (effP + effGrpReal) > 0) flags.push('balance-without-payments')

    rows.push({
      id: u.id, name: u.name,
      paid: { priv: paidPriv, grp: paidGrp },
      stored: { legP, legG, cycP, cycG, cycle_key: u.cycle_key, cycle_expires_at: u.cycle_expires_at, expired: exp },
      effective: { priv: effP, grpReal: effGrpReal, grpDisplay: effGrpDisplay, remainingNow, remainingNew },
      slots: { total: mySlots.length, confirmed: confirmed.length, deducted: deducted.length, confirmedNotDeducted: confirmedNotDeducted.length },
      fifo: { all: fifoAll, deducted: fifoDeducted },
      flags,
    })
  }

  // ── name integrity ──────────────────────────────────────────────
  const orphanSegments = [...segOwners.entries()]
    .filter(([seg]) => !playerNormNames.has(seg))
    .map(([seg, e]) => ({ segment: seg, count: e.count, matchesPlayerPrefix: [...playerNormNames.keys()].some(k => k.startsWith(seg) || seg.startsWith(k)) }))
    .sort((a, b) => b.count - a.count)

  const dupNames = new Map()
  for (const u of players) {
    const k = norm(u.name)
    if (!dupNames.has(k)) dupNames.set(k, [])
    dupNames.get(k).push(u.id)
  }
  const duplicates = [...dupNames.entries()].filter(([, ids]) => ids.length > 1)

  // payments whose player_name does not match its player_id's user name (or has no player_id)
  const nameById = new Map(allUsers.map(u => [u.id, u.name]))
  const suspiciousPays = pays.filter(p => {
    if (p.player_id == null) return !!p.player_name
    return norm(nameById.get(p.player_id)) !== norm(p.player_name)
  }).map(p => ({ id: p.id, player_id: p.player_id, player_name: p.player_name, user_name: p.player_id ? nameById.get(p.player_id) : null, amount: p.amount, priv: p.private_sessions, grp: p.group_sessions, status: p.status, date: p.date }))

  const out = { generatedAt: new Date().toISOString(), rows, orphanSegments, duplicates, suspiciousPays }

  // ── print ───────────────────────────────────────────────────────
  console.log('=== BALANCE AUDIT (read-only) ===')
  console.log('name | paid P/G | stored leg/cyc P/G | eff P/Greal | disp: nowP+2P Greal -> remaining (now -> new) | slots tot/conf/ded/noDed | fifoAll P/G fifoDed P/G | flags')
  for (const r of rows) {
    const line = `${r.id} ${r.name} | ${r.paid.priv}/${r.paid.grp} | ${r.stored.legP}/${r.stored.legG} +${r.stored.cycP}/${r.stored.cycG}${r.stored.cycle_key ? `(${r.stored.cycle_key}${r.stored.expired ? ',EXPIRED' : ''})` : ''} | ${r.effective.priv}/${r.effective.grpReal} | ${r.effective.remainingNow} -> ${r.effective.remainingNew} | ${r.slots.total}/${r.slots.confirmed}/${r.slots.deducted}/${r.slots.confirmedNotDeducted} | ${r.fifo.all.priv}/${r.fifo.all.grp} ${r.fifo.deducted.priv}/${r.fifo.deducted.grp} | ${r.flags.join(',') || 'ok'}`
    console.log(line)
  }

  const flagged = rows.filter(r => r.flags.length)
  console.log(`\nplayers: ${rows.length} | flagged: ${flagged.length} | clean: ${rows.length - flagged.length}`)

  console.log('\n=== ORPHAN SLOT NAME SEGMENTS (no matching player) ===')
  if (!orphanSegments.length) console.log('(none)')
  for (const o of orphanSegments) console.log(`  "${o.segment}" x${o.count}${o.matchesPlayerPrefix ? '  <-- similar to a player name (merge candidate)' : ''}`)

  console.log('\n=== DUPLICATE PLAYER ROWS (same normalized name) ===')
  if (!duplicates.length) console.log('(none)')
  for (const [k, ids] of duplicates) console.log(`  "${k}" -> user_ids ${ids.join(', ')}`)

  console.log('\n=== PAYMENTS WITH NAME/ID MISMATCH ===')
  if (!suspiciousPays.length) console.log('(none)')
  for (const p of suspiciousPays) console.log(`  pay#${p.id} ${p.date} ${p.amount} EGP (${p.priv}P/${p.grp}G, ${p.status}) player_id=${p.player_id} player_name="${p.player_name}" user_name="${p.user_name}"`)

  if (hasFlag('json')) {
    if (!existsSync(join(__dirname, 'payments-backups'))) mkdirSync(join(__dirname, 'payments-backups'), { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const path = join(__dirname, 'payments-backups', `balance-audit-${ts}.json`)
    writeFileSync(path, JSON.stringify(out, null, 2))
    console.log(`\njson: ${path}`)
  }
}

try {
  await audit()
} finally {
  if (client) await client.end().catch(() => {})
}
