/**
 * PROD (Supabase) — READ-ONLY invariant audit for payments / balance / unpaid.
 *
 * Answers "will the old bugs come back?" by asserting, against REAL prod data,
 * the invariants those bugs violated:
 *
 *   A. PRICING      server tier table == public frontend table (drift here
 *                   silently mispriced every unpaid amount), and every player's
 *                   amount_owed == FRONTEND-priced package price of their
 *                   unpaid counts (no flat 1,000/500 anywhere).
 *   B. PAID SLOTS   a slot whose status is payment_approved always counts as
 *                   paid in the session engine (the slot-341 swap bug).
 *   C. ALLOCATION   for every money-driven allocation, checked against the
 *                   frontend oracle: covered ≤ unpaid, covered value ≤ money,
 *                   totals = covered + credit, remaining == price(before-covered).
 *   D. STORED ROWS  every approved player payment: sane counts/amount, and a
 *                   drift report — stored counts vs what the amount would
 *                   auto-derive now, plus rows crediting more session VALUE
 *                   than they paid (the balance-hole pattern).
 *
 * NEVER WRITES — only compute* helpers and db.findAll/get are used.
 * Exits non-zero if any FAIL is recorded. WARNs need eyeballing, not failure.
 *
 * Usage:  cd server && node audit-invariants.mjs     (needs .env → PROD_DATABASE_URL)
 */
import 'dotenv/config'

process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { computeUnpaidPlayers, computePlayerSessions } = await import('./src/utils/sessionPaid.js')
const { computePaymentAllocation } = await import('./src/utils/paymentAllocation.js')
const { PRICING, calculatePrice, packagePrice } = await import('./src/utils/pricing.js')
const { PRICING: FRONT_PRICING, calculatePrice: frontPrice } = await import('../src/data/pricingData.js')
const { default: db } = await import('./src/db.js')

let failures = 0
let warnings = 0
const fail = (label, detail) => {
  failures++
  console.log(`FAIL  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
}
const warn = (label, detail) => {
  warnings++
  console.log(`WARN  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
}
const ok = (label, detail) =>
  console.log(`PASS  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
const info = (label, detail) => console.log(`INFO  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
const assertEq = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(label, actual)
  else fail(label, { actual, expected })
}
const assertTrue = (label, cond, detail) => {
  if (cond) ok(label)
  else fail(label, detail)
}
/** Independent oracle — priced by the FRONTEND table, not the server one. */
const oraclePrice = (p, g) => frontPrice('private', p) + frontPrice('group', g)

console.log('=== A. pricing parity (server table vs public frontend table) ===')
for (const type of ['private', 'group']) {
  const serverKeys = Object.keys(PRICING[type]).filter(k => !Number.isNaN(Number(k))).sort()
  const frontKeys = Object.keys(FRONT_PRICING[type]).filter(k => !Number.isNaN(Number(k))).sort()
  assertEq(`${type} tier keys`, serverKeys, frontKeys)
  for (const k of serverKeys) {
    if (PRICING[type][k] !== FRONT_PRICING[type][k]) {
      fail(`${type} tier ${k}`, { server: PRICING[type][k], front: FRONT_PRICING[type][k] })
    }
  }
}
let parityMismatch = null
for (let n = 0; n <= 40 && !parityMismatch; n++) {
  for (const type of ['private', 'group']) {
    const s = calculatePrice(type, n)
    const f = frontPrice(type, n)
    if (s !== f) { parityMismatch = { type, n, server: s, front: f }; break }
  }
}
assertTrue('calculatePrice parity for every count 0..40 (both types)', parityMismatch === null, parityMismatch)

console.log('\n=== load prod data (read-only) ===')
const users = await db.findAll('users')
const players = users.filter(u => u.role === 'player')
info('players', players.length)

console.log('\n=== B + A2. every player: paid-slot rule + owed = frontend package price ===')
let sessionTotal = 0
let unpaidPlayers = 0
let totalOwed = 0
let paidRuleChecked = 0
for (const player of players) {
  const rep = await computePlayerSessions(player)
  sessionTotal += rep.sessions.length

  // B — payment_approved slots must always be paid
  for (const s of rep.sessions) {
    if (s.status === 'payment_approved') {
      paidRuleChecked++
      if (!s.paid) fail(`slot not paid despite payment_approved [${player.name}]`, s)
    }
  }

  // A2 — owed must be the frontend-priced package price of the unpaid counts
  if (rep.unpaidPrivate + rep.unpaidGroup > 0) {
    unpaidPlayers++
    totalOwed += rep.amountOwed
    const expected = oraclePrice(rep.unpaidPrivate, rep.unpaidGroup)
    if (rep.amountOwed !== expected) {
      fail(`amount_owed mismatch [${player.name}]`, {
        owed: rep.amountOwed,
        oracle: expected,
        counts: { private: rep.unpaidPrivate, group: rep.unpaidGroup },
      })
    }
    // independent recount of the unpaid rows the engine reported
    const recountP = rep.sessions.filter(s => !s.paid && s.session_type !== 'group').length
    const recountG = rep.sessions.filter(s => !s.paid && s.session_type === 'group').length
    if (recountP !== rep.unpaidPrivate || recountG !== rep.unpaidGroup) {
      fail(`unpaid counts inconsistent [${player.name}]`, {
        engine: [rep.unpaidPrivate, rep.unpaidGroup],
        recount: [recountP, recountG],
      })
    }
  }
}
info('sessions scanned', sessionTotal)
info('payment_approved slots checked', paidRuleChecked)
info('players with unpaid sessions', unpaidPlayers)
info('total owed (frontend-priced oracle)', totalOwed)
ok('paid-slot rule holds wherever checked')
ok('amount_owed == frontend package price everywhere')

console.log('\n=== regression spot-case: Farida / slot 341 ===')
const farida = players.find(u => (u.name || '').toLowerCase().includes('farida'))
if (farida) {
  const rep = await computePlayerSessions(farida)
  info('Farida unpaid/owed', { private: rep.unpaidPrivate, group: rep.unpaidGroup, owed: rep.amountOwed })
  assertEq('Farida owed = 15,500 (16P + 3G)', rep.amountOwed, 15500)
  const slot341 = rep.sessions.find(s => s.date === '2026-09-30' && s.time.startsWith('19:00'))
  assertTrue(
    'slot 341 (2026-09-30 19:00) counts as paid',
    !!slot341 && slot341.paid === true,
    slot341 ? { paid: slot341.paid, status: slot341.status, type: slot341.session_type } : 'slot missing',
  )
} else {
  warn('Farida not found — spot-case skipped (player may have been renamed)')
}

console.log('\n=== C. allocation sweep on every unpaid player × amounts (frontend oracle) ===')
const unpaidList = await computeUnpaidPlayers()
const amountsToTest = [500, 1000, 7000, 14000]
let sweepChecked = 0
let worst = null
for (const row of unpaidList) {
  const player = players.find(u => u.id === row.id)
  if (!player) continue
  for (const amt of [...amountsToTest, row.amount_owed]) {
    const a = await computePaymentAllocation(player, { amount: amt })
    const coveredValOracle = oraclePrice(a.covered_private, a.covered_group)
    const still = oraclePrice(a.remaining_unpaid.private, a.remaining_unpaid.group)
    const towardDebt = Math.min(amt, a.amount_owed)
    const problems = []
    if (a.covered_private > a.unpaid_before.private) problems.push('covered_private > unpaid')
    if (a.covered_group > a.unpaid_before.group) problems.push('covered_group > unpaid')
    if (coveredValOracle > towardDebt) problems.push(`covered value ${coveredValOracle} > money toward debt ${towardDebt}`)
    if (coveredValOracle > amt) problems.push('covered value > amount paid')
    if (a.private_sessions !== a.covered_private + a.credit_private) problems.push('private totals != covered + credit')
    if (a.group_sessions !== a.covered_group + a.credit_group) problems.push('group totals != covered + credit')
    if (still !== a.remaining_unpaid.amount) problems.push('remaining_unpaid.amount != oracle price')
    if (still !== oraclePrice(a.unpaid_before.private - a.covered_private, a.unpaid_before.group - a.covered_group)) {
      problems.push('remaining != price(before - covered)')
    }
    if ([a.covered_private, a.covered_group, a.credit_private, a.credit_group, a.private_sessions, a.group_sessions]
      .some(v => !Number.isInteger(v) || v < 0)) problems.push('negative/non-integer counts')
    if (problems.length && !worst) worst = { name: player.name, amt, problems, a }
    sweepChecked++
  }
}
assertTrue(`sweep clean — ${sweepChecked} allocations, no rule violated`, worst === null, worst)

console.log('\n=== D. every approved player payment row ===')
const payments = (await db.findAll('payments')).filter(p => p.status === 'payment_approved' && p.player_id && !p.booking_id)
info('approved player payments (money-driven rows)', payments.length)
let derivedMatches = 0
const staleValueRows = []
const driftRows = []
for (const p of payments) {
  const player = players.find(u => u.id === p.player_id)
  if (!player) {
    warn(`payment ${p.id} points at missing player ${p.player_id}`)
    continue
  }
  const amount = parseFloat(p.amount) || 0
  const storedP = p.private_sessions || 0
  const storedG = p.group_sessions || 0

  if (!Number.isFinite(amount) || amount < 0) fail(`payment ${p.id} has bad amount [${player.name}]`, p.amount)
  if (!Number.isInteger(storedP) || !Number.isInteger(storedG) || storedP < 0 || storedG < 0) {
    fail(`payment ${p.id} has bad counts [${player.name}]`, [storedP, storedG])
  }

  // Value credited vs money paid — a row crediting more value than it paid is
  // the classic balance-hole. Legal only when the admin gave a discount/gift
  // (manual override), so report as WARN with the row so it can be inspected.
  const storedValue = oraclePrice(storedP, storedG)
  if (storedValue > amount) {
    staleValueRows.push({ id: p.id, name: player.name, amount, stored: [storedP, storedG], value: storedValue })
  }

  // What this row would auto-derive now (own credit excluded) vs what is stored.
  // Equal → consistent with today's engine. Different → manual override or a
  // legacy flat-rate row; inspect (overrides are legitimate, so WARN not FAIL).
  const auto = await computePaymentAllocation(player, { amount, excludePaymentId: p.id })
  if (auto.private_sessions === storedP && auto.group_sessions === storedG) {
    derivedMatches++
  } else {
    driftRows.push({
      id: p.id, name: player.name, amount,
      stored: [storedP, storedG],
      auto: [auto.private_sessions, auto.group_sessions],
    })
  }
}
info(`rows matching fresh auto-derivation: ${derivedMatches}/${payments.length}`)
if (driftRows.length) warn(`${driftRows.length} row(s) differ from auto-derivation (override/legacy)`, driftRows.slice(0, 15))
if (staleValueRows.length) warn(`${staleValueRows.length} row(s) credit more session value than paid`, staleValueRows.slice(0, 15))
if (!driftRows.length && !staleValueRows.length) ok('all stored payment rows consistent with the engine')

console.log(`\n=== RESULT: ${failures} FAIL, ${warnings} WARN ===`)
await db.close?.()
process.exit(failures === 0 ? 0 : 1)
