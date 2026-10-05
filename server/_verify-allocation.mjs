/**
 * READ-ONLY verification of the money-driven unpaid report and payment
 * allocation under the Best-Package Rule. Runs the REAL server modules.
 * Asserts:
 *   1. pure pricing + nearestPackPool round-ups (16,8 / (8,0) / (4,4))
 *   2. Farida spot-case: amount_owed == oracle price of her unpaid counts,
 *      slot 341 on 2026-09-30 19:00 counts as PAID when it exists
 *   3. allocation on Farida: full payment covers everything; exact-pack
 *      partials derive the exact pack; overpayment covers everything and the
 *      cash ledger stays self-consistent (cash_gap = amount − pool value)
 *   4. every player: coverage never exceeds unpaid, remaining price stays
 *      consistent, cash ledger self-consistent
 * Never writes: computePlayerSessions / computeUnpaidPlayers /
 * computePaymentAllocation only read (findAll / get).
 *
 * Targets PROD_DATABASE_URL by default; AUDIT_TARGET=local → local DB.
 */
import 'dotenv/config'

process.env.DB_ENABLED = 'true'
if (process.env.AUDIT_TARGET !== 'local') process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { computeUnpaidPlayers, computePlayerSessions } = await import('./src/utils/sessionPaid.js')
const { computePaymentAllocation } = await import('./src/utils/paymentAllocation.js')
const { packagePrice, bestCoverage, calculatePrice, nearestPackPool } = await import('./src/utils/pricing.js')
const { default: db } = await import('./src/db.js')

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` expected ${JSON.stringify(expected)}`}`)
}
const info = (label, value) => console.log(`INFO  ${label}: ${JSON.stringify(value)}`)

console.log('--- 1) pure pricing + pack rule ---')
check('calculatePrice private 9', calculatePrice('private', 9), 8000)
check('calculatePrice private 16', calculatePrice('private', 16), 14000)
check('packagePrice 16P + 3G', packagePrice(16, 3), 15500)
check('bestCoverage 7000 vs 9 unpaid private', bestCoverage(7000, 9, 0), { private: 8, group: 0, value: 7000 })
check('remaining after 7000 on 9P', packagePrice(9 - 8, 0), 1000)
const faridaPack = nearestPackPool(16000, 17500)
check('nearestPackPool 16,000 vs debt 17,500 → (16,8) 17,500', [faridaPack.private, faridaPack.group, faridaPack.value], [16, 8, 17500])
const exactPack = nearestPackPool(7000, 7100)
check('nearestPackPool exact 7,000 debt 7,100 → (8,0) 7,000', [exactPack.private, exactPack.group, exactPack.value], [8, 0, 7000])
const dusty = nearestPackPool(5000, 0)
check('nearestPackPool 5,000 (no debt) → (4,4) 5,400 round-up', [dusty.private, dusty.group, dusty.value], [4, 4, 5400])

console.log('\n--- 2) Farida unpaid report (adaptive) ---')
const users = await db.findAll('users')
const farida = users.find(u => (u.name || '').toLowerCase().includes('farida'))
if (!farida) {
  console.log('WARN  Farida not found — spot-case skipped (player may have been renamed)')
} else {
  const rep = await computePlayerSessions(farida)
  info('Farida unpaid counts', { private: rep.unpaidPrivate, group: rep.unpaidGroup, owed: rep.amountOwed })
  if (rep.unpaidPrivate + rep.unpaidGroup > 0) {
    check('owed == package price of unpaid counts', rep.amountOwed, packagePrice(rep.unpaidPrivate, rep.unpaidGroup))
  }
  const slot341 = rep.sessions.find(s => s.date === '2026-09-30' && s.time.startsWith('19:00'))
  info('slot on 2026-09-30 19:00', slot341 ? { paid: slot341.paid, status: slot341.status, type: slot341.session_type } : 'not in Farida sessions')
  if (slot341 && slot341.status === 'payment_approved') check('slot 341 counts as paid', slot341.paid, true)
  else if (slot341) console.log(`INFO  slot 341 status=${slot341.status} paid=${slot341.paid} — paid flag follows status, check skipped`)
  else console.log('WARN  slot 341 not in Farida sessions — schedule moved, slot check skipped')

  console.log('\n--- 3) allocation on Farida (money drives coverage) ---')
  const ledgerOk = (a, amt) => a.cash_gap === amt - packagePrice(a.private_sessions, a.group_sessions) &&
    a.cash_balance_after === a.cash_balance_before + a.cash_gap

  const full = await computePaymentAllocation(farida, { amount: rep.amountOwed })
  info('pay full debt', full)
  check('covers all unpaid', [full.covered_private, full.covered_group], [full.unpaid_before.private, full.unpaid_before.group])
  check('nothing still unpaid', [full.remaining_unpaid.private, full.remaining_unpaid.group, full.remaining_unpaid.amount], [0, 0, 0])
  check('cash ledger consistent', ledgerOk(full, rep.amountOwed), true)

  const partial = await computePaymentAllocation(farida, { amount: 7000 })
  info('pay 7,000', partial)
  if (rep.unpaidPrivate >= 8) {
    check('exact pack derives (8,0)', [partial.private_sessions, partial.group_sessions, partial.cash_gap], [8, 0, 0])
    check('covers 8 private', [partial.covered_private, partial.covered_group], [8, 0])
    check('row totals = covered + credit', [partial.private_sessions, partial.group_sessions],
      [partial.covered_private + partial.credit_private, partial.covered_group + partial.credit_group])
  }
  check('cash ledger consistent', ledgerOk(partial, 7000), true)

  const over = await computePaymentAllocation(farida, { amount: 20000 })
  info('pay 20,000', over)
  check('covers all unpaid', [over.covered_private, over.covered_group], [over.unpaid_before.private, over.unpaid_before.group])
  check('nothing still unpaid', over.remaining_unpaid.amount, 0)
  check('cash ledger consistent', ledgerOk(over, 20000), true)
}

console.log('\n--- 4) every player: coverage never exceeds unpaid, ledger consistent ---')
const unpaid = await computeUnpaidPlayers()
info('players with unpaid sessions or cash owed', unpaid.length)
info('total sessions owed (package priced)', unpaid.reduce((s, p) => s + (p.sessions_owed ?? p.amount_owed), 0))
info('total cash owed (shortfalls)', unpaid.reduce((s, p) => s + (p.cash_owed || 0), 0))
info('total owed (amount_owed = sessions + cash)', unpaid.reduce((s, p) => s + p.amount_owed, 0))
let worst = null
for (const p of unpaid) {
  const player = users.find(u => u.id === p.id)
  if (!player) continue
  for (const amt of [500, 1000, 3500, 7000, 14000, p.amount_owed]) {
    const a = await computePaymentAllocation(player, { amount: amt })
    const still = packagePrice(a.remaining_unpaid.private, a.remaining_unpaid.group)
    const expectedStill = packagePrice(
      a.unpaid_before.private - a.covered_private,
      a.unpaid_before.group - a.covered_group,
    )
    const gap = amt - packagePrice(a.private_sessions, a.group_sessions)
    const bad = a.covered_private > a.unpaid_before.private ||
      a.covered_group > a.unpaid_before.group ||
      still !== expectedStill ||
      still !== a.remaining_unpaid.amount ||
      a.cash_gap !== gap ||
      a.cash_balance_after !== a.cash_balance_before + gap ||
      [a.covered_private, a.covered_group, a.credit_private, a.credit_group, a.private_sessions, a.group_sessions]
        .some(v => !Number.isInteger(v) || v < 0)
    if (bad && !worst) worst = { name: p.name, amt, a, still, expectedStill, gap }
  }
}
check('no allocation violates its own rules', worst, null)

// Nuance report: because owed is priced per COUNT of remaining sessions,
// splitting a bundle can reprice (e.g. 16P = 14,000 but 15P = 13,800, so
// covering 1P for 1,000 leaves 15,300 owed instead of 14,500). Quantify it.
// Baseline is the SESSION package price only (cash shortfall excluded).
let gapCases = 0, maxGap = 0, gapExample = null
for (const p of unpaid) {
  const player = users.find(u => u.id === p.id)
  if (!player) continue
  const sessionsOwed = p.sessions_owed ?? (p.amount_owed - (p.cash_owed || 0))
  for (const amt of [500, 1000, 3500, 7000]) {
    if (amt >= sessionsOwed) continue
    const a = await computePaymentAllocation(player, { amount: amt })
    const gap = packagePrice(a.covered_private, a.covered_group) +
      packagePrice(a.remaining_unpaid.private, a.remaining_unpaid.group) - sessionsOwed
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
