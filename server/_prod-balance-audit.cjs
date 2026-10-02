/**
 * Read-only production balance integrity audit (SELECT statements only).
 *
 * Detects the Ammar/Aley bug class across ALL players:
 *   1. FLAG-LEVEL: player_confirmed slots never actually deducted
 *      (balance_status NULL or 'shortfall') — session consumed, balance not reduced
 *   2. SHORTFALL slots in any status (new-code explicit under-deduction)
 *   3. PER-PLAYER arithmetic (indicative): effective balance vs paid - used
 *   4. Regression check: Ammar effG must be 1, Aley effG must be 2
 *
 * Run: node _prod-balance-audit.cjs
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

async function main() {
  const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
  const c = new Client({
    host: u.hostname, port: Number(u.port) || 6543,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
    statement_timeout: 60000,
  })
  await c.connect()

  // Read-only guard: every statement must be a SELECT/WITH
  const q = async (sql) => {
    if (!/^\s*(select|with)/i.test(sql)) throw new Error('NON-SELECT blocked')
    return (await c.query(sql)).rows
  }

  try {
    const users = await q(`SELECT user_id AS id, name, role, private_balance, group_balance,
      cycle_private, cycle_group, cycle_key, cycle_expires_at
      FROM users WHERE role = 'player'`)
    const slots = await q(`SELECT id, date::text AS date, time, status, session_type, player_text,
      balance_status, booking_id FROM slots
      WHERE player_text IS NOT NULL AND player_text <> ''`)
    const bookings = await q(`SELECT id, session_type, user_id FROM bookings`)
    const payments = await q(`SELECT id, player_id, booking_id, status, private_sessions,
      group_sessions, credited_private, credited_group, settled_private, settled_group
      FROM payments WHERE status = 'payment_approved'`)

    const now = new Date()
    const isExpired = (u2) => u2.cycle_expires_at && new Date(u2.cycle_expires_at) < now
    const effP = (u2) => Math.max(0, u2.private_balance || 0) + (isExpired(u2) ? 0 : Math.max(0, u2.cycle_private || 0))
    const effG = (u2) => {
      const leg = Math.max(0, u2.group_balance || 0)
      const legP = Math.max(0, u2.private_balance || 0)
      const cyc = isExpired(u2) ? 0 : Math.max(0, u2.cycle_group || 0)
      const cycP = isExpired(u2) ? 0 : Math.max(0, u2.cycle_private || 0)
      return leg + legP * 2 + cyc + cycP * 2
    }

    const byName = new Map()
    for (const u2 of users) byName.set((u2.name || '').toLowerCase(), u2)
    const bookType = new Map(bookings.map(b => [b.id, b.session_type]))

    // Per-player accumulation
    const agg = new Map() // user.id -> { usedP, usedG, candidates: [] }
    const getAgg = (id) => {
      if (!agg.has(id)) agg.set(id, { usedP: 0, usedG: 0, candidates: [] })
      return agg.get(id)
    }
    const shortfallSlots = []
    let unmatchedConfirmed = 0

    for (const s of slots) {
      const names = (s.player_text || '').split(/[/+]/).map(n => n.trim().toLowerCase()).filter(Boolean)
      const confirmed = s.status === 'player_confirmed'
      const flagBad = confirmed && (s.balance_status === null || s.balance_status === 'shortfall')
      if (s.balance_status === 'shortfall') shortfallSlots.push(s)
      if (!confirmed && !flagBad && s.balance_status !== 'shortfall') continue

      for (const name of names) {
        const u2 = byName.get(name)
        if (!u2) continue
        if (confirmed) {
          let type = s.session_type
          if (!type && s.booking_id) type = bookType.get(s.booking_id)
          const a = getAgg(u2.id)
          if (type === 'group') a.usedG++
          else a.usedP++
          if (flagBad) a.candidates.push(s)
        }
      }
      if (confirmed && !names.some(n => byName.has(n))) unmatchedConfirmed++
    }

    // Payments per player
    const payAgg = new Map()
    const bookingUser = new Map(bookings.map(b => [b.id, b.user_id]))
    for (const p of payments) {
      const pid = p.player_id || p.booking_id && bookingUser.get(p.booking_id)
      if (!pid) continue
      if (!payAgg.has(pid)) payAgg.set(pid, { paidP: 0, paidG: 0 })
      const a = payAgg.get(pid)
      const hasSettlement = p.credited_private != null || p.credited_group != null
      if (hasSettlement) {
        a.paidP += Math.max(0, p.credited_private || 0)
        a.paidG += Math.max(0, p.credited_group || 0)
      } else {
        a.paidP += p.private_sessions || 0
        a.paidG += p.group_sessions || 0
      }
    }

    // ── Section 1: Ammar-class candidates ──
    console.log('═══ SECTION 1: NEVER-DEDUCTED CONFIRMED SLOTS (Ammar/Aley bug class) ═══')
    let totalCand = 0
    let playersWithCand = 0
    for (const u2 of users) {
      const a = agg.get(u2.id)
      if (!a || !a.candidates.length) continue
      playersWithCand++
      totalCand += a.candidates.length
      console.log(`\n▸ ${u2.name} (id ${u2.id}) — effP=${effP(u2)} effG=${effG(u2)} ` +
        `legacyP=${u2.private_balance} legacyG=${u2.group_balance} ` +
        `cycleP=${u2.cycle_private} cycleG=${u2.cycle_group}${isExpired(u2) ? ' [CYCLE EXPIRED]' : ''}`)
      for (const s of a.candidates) {
        console.log(`    slot ${s.id} | ${s.date} ${s.time} | ${s.session_type || '?'} | ` +
          `status=${s.status} | balance_status=${s.balance_status === null ? 'NULL' : s.balance_status}`)
      }
    }
    if (!totalCand) console.log('  none ✓')

    // ── Section 2: shortfall slots ──
    console.log('\n═══ SECTION 2: SHORTFALL SLOTS (recorded, never deducted) ═══')
    if (!shortfallSlots.length) console.log('  none ✓')
    for (const s of shortfallSlots) {
      console.log(`  slot ${s.id} | ${s.date} ${s.time} | ${s.status} | ${s.session_type || '?'} | "${s.player_text}"`)
    }

    // ── Section 3: per-player arithmetic ──
    console.log('\n═══ SECTION 3: PER-PLAYER (eff vs paid-used; positive delta = suspect) ═══')
    console.log('name | effP effG | paidP paidG | usedP usedG | ΔP ΔG | flags')
    const suspects = []
    for (const u2 of users) {
      const a = agg.get(u2.id) || { usedP: 0, usedG: 0, candidates: [] }
      const p = payAgg.get(u2.id) || { paidP: 0, paidG: 0 }
      const dp = effP(u2) - (p.paidP - a.usedP)
      const dg = effG(u2) - (p.paidG - a.usedG)
      const flags = []
      if (a.candidates.length) flags.push(`NEVER-DEDUCTED:${a.candidates.length}`)
      const legacyKnown = (u2.private_balance || 0) !== 0 || (u2.group_balance || 0) !== 0
      const noPayments = p.paidP === 0 && p.paidG === 0
      if (dp > 0 || dg > 0) flags.push(noPayments ? 'delta>0(no-payments/legacy)' : 'delta>0')
      if (isExpired(u2)) flags.push('cycle-expired')
      if (flags.length || dp > 0 || dg > 0 || a.candidates.length) {
        suspects.push(u2.name)
        console.log(`  ${u2.name} | ${effP(u2)} ${effG(u2)} | ${p.paidP} ${p.paidG} | ${a.usedP} ${a.usedG} | ${dp} ${dg} | ${flags.join(' ')}`)
      }
      void legacyKnown
    }

    // ── Section 4: regression checks ──
    console.log('\n═══ SECTION 4: REGRESSION CHECKS ═══')
    const u7 = users.find(x => x.id === 7)
    const u6 = users.find(x => x.id === 6)
    const aOk = u7 && effG(u7) === 1
    const lOk = u6 && effG(u6) === 2
    console.log(`  Ammar (id 7) effG=${u7 ? effG(u7) : '?'} expect 1 → ${aOk ? 'OK ✓' : 'FAIL ✗'}`)
    console.log(`  Aley  (id 6) effG=${u6 ? effG(u6) : '?'} expect 2 → ${lOk ? 'OK ✓' : 'FAIL ✗'}`)
    if (!aOk || !lOk) process.exitCode = 1

    console.log(`\n═══ SUMMARY: ${users.length} players, ${slots.length} slots scanned | ` +
      `${playersWithCand} players w/ never-deducted slots (${totalCand} slots) | ` +
      `${shortfallSlots.length} shortfall | ${unmatchedConfirmed} confirmed slots w/ unknown player names | ` +
      `${suspects.length} arithmetic suspects ═══`)
  } finally {
    await c.end()
  }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
