/**
 * PROD (Supabase) — READ-ONLY verification of the money-driven unpaid report
 * and payment allocation. Runs the REAL server modules against PROD_DATABASE_URL.
 * Asserts:
 *   1. Farida Fathallah: 16 private + 3 group unpaid, owed = 15,500
 *      (slot 341 on 2026-09-30 19:00 must count as PAID — status payment_approved)
 *   2. packagePrice(9 private) = 8,000 and bestCoverage(7,000, 9, 0) = 8 covered
 *      → pay 7,000 on 9 unpaid private → 8 covered, 1 still unpaid (EGP 1,000)
 *   3. Allocation on real players never covers more than is unpaid and the
 *      leftover always equals the remaining unpaid price.
 * Never writes: computePlayerSessions / computeUnpaidPlayers / computePaymentAllocation
 * only read (findAll / get).
 */
import 'dotenv/config'

process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { computeUnpaidPlayers, computePlayerSessions } = await import('./src/utils/sessionPaid.js')
const { computePaymentAllocation } = await import('./src/utils/paymentAllocation.js')
const { packagePrice, bestCoverage, calculatePrice } = await import('./src/utils/pricing.js')
const { default: db } = await import('./src/db.js')

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` expected ${JSON.stringify(expected)}`}`)
}
const info = (label, value) => console.log(`INFO  ${label}: ${JSON.stringify(value)}`)

console.log('--- 1) pure pricing ---')
check('calculatePrice private 9', calculatePrice('private', 9), 8000)
check('calculatePrice private 16', calculatePrice('private', 16), 14000)
check('packagePrice 16P + 3G', packagePrice(16, 3), 15500)
check('bestCoverage 7000 vs 9 unpaid private', bestCoverage(7000, 9, 0), { private: 8, group: 0, value: 7000 })
check('remaining after 7000 on 9P', packagePrice(9 - 8, 0), 1000)

console.log('\n--- 2) Farida unpaid report ---')
const users = await db.findAll('users')
const farida = users.find(u => (u.name || '').toLowerCase().includes('farida'))
if (!farida) {
  console.log('FAIL  Farida not found in prod users')
  failures++
} else {
  const rep = await computePlayerSessions(farida)
  info('Farida unpaid counts', { private: rep.unpaidPrivate, group: rep.unpaidGroup, owed: rep.amountOwed })
  check('Farida owed (16P + 3G)', rep.amountOwed, 15500)
  check('Farida unpaid private', rep.unpaidPrivate, 16)
  check('Farida unpaid group', rep.unpaidGroup, 3)
  const slot341 = rep.sessions.find(s => s.date === '2026-09-30' && s.time.startsWith('19:00'))
  info('slot on 2026-09-30 19:00', slot341 ? { paid: slot341.paid, status: slot341.status, type: slot341.session_type } : 'not in Farida sessions')
  check('slot 341 counts as paid', slot341 ? slot341.paid : 'missing', true)

  console.log('\n--- 3) allocation on Farida (money drives coverage) ---')
  const full = await computePaymentAllocation(farida, { amount: 15500 })
  info('pay 15,500', full)
  check('covers all 16P + 3G', [full.covered_private, full.covered_group], [16, 3])
  check('nothing left to credit', [full.credit_private, full.credit_group], [0, 0])
  check('nothing still unpaid', [full.remaining_unpaid.private, full.remaining_unpaid.group, full.remaining_unpaid.amount], [0, 0, 0])

  const partial = await computePaymentAllocation(farida, { amount: 7000 })
  info('pay 7,000', partial)
  check('covers 8 private', [partial.covered_private, partial.covered_group], [8, 0])
  check('still unpaid 8P + 3G = 8,500', partial.remaining_unpaid.amount, 8500)
  check('row totals = covered + credit', [partial.private_sessions, partial.group_sessions], [8, 0])

  const over = await computePaymentAllocation(farida, { amount: 20000 })
  info('pay 20,000', over)
  check('covers all unpaid', [over.covered_private, over.covered_group], [16, 3])
  check('leftover 4,500 credited', packagePrice(over.credit_private, over.credit_group) <= 4500, true)
}

console.log('\n--- 4) every prod player: coverage never exceeds unpaid, leftover consistent ---')
const unpaid = await computeUnpaidPlayers()
info('players with unpaid sessions', unpaid.length)
info('total owed (package priced)', unpaid.reduce((s, p) => s + p.amount_owed, 0))
info('total owed (old flat 1000/500)', unpaid.reduce((s, p) => s + (p.unpaid_private * 1000 + p.unpaid_group * 500), 0))
let worst = null
for (const p of unpaid) {
  const player = users.find(u => u.id === p.id)
  if (!player) continue
  for (const amt of [500, 1000, 3500, 7000, 14000, p.amount_owed]) {
    const a = await computePaymentAllocation(player, { amount: amt })
    const coveredVal = packagePrice(a.covered_private, a.covered_group)
    const still = packagePrice(a.remaining_unpaid.private, a.remaining_unpaid.group)
    const expectedStill = packagePrice(
      a.unpaid_before.private - a.covered_private,
      a.unpaid_before.group - a.covered_group,
    )
    const bad = a.covered_private > a.unpaid_before.private ||
      a.covered_group > a.unpaid_before.group ||
      coveredVal > amt ||
      still !== expectedStill ||
      still !== a.remaining_unpaid.amount ||
      a.private_sessions !== a.covered_private + a.credit_private ||
      a.group_sessions !== a.covered_group + a.credit_group
    if (bad && !worst) worst = { name: p.name, amt, a, coveredVal, still, expectedStill }
  }
}
check('no allocation violates its own rules', worst, null)

// Nuance report: because owed is priced per COUNT of remaining sessions,
// splitting a bundle can reprice (e.g. 16P = 14,000 but 15P = 13,800, so
// covering 1P for 1,000 leaves 15,300 owed instead of 14,500). Quantify it.
let gapCases = 0, maxGap = 0, gapExample = null
for (const p of unpaid) {
  const player = users.find(u => u.id === p.id)
  if (!player) continue
  for (const amt of [500, 1000, 3500, 7000]) {
    if (amt >= p.amount_owed) continue
    const a = await computePaymentAllocation(player, { amount: amt })
    const gap = packagePrice(a.covered_private, a.covered_group) +
      packagePrice(a.remaining_unpaid.private, a.remaining_unpaid.group) - p.amount_owed
    if (gap > 0) {
      gapCases++
      if (gap > maxGap) { maxGap = gap; gapExample = { name: p.name, amt, gap } }
    }
  }
}
info('partial payments where splitting repriced the remainder', { cases: gapCases, maxGap, example: gapExample })

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
await db.close?.()
process.exit(failures === 0 ? 0 : 1)
