import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateFromSessions } from '../src/utils/paymentAllocation.js'
import { simulateFifo } from '../src/utils/convertBalance.js'
import { planSettlement } from '../src/utils/cycle.js'
import { planPaymentReversal } from '../src/utils/paymentReversal.js'
import { packagePrice } from '../src/utils/pricing.js'

// Session lists are NEWEST-FIRST (computePlayerSessions returns them reversed);
// build fixtures chronologically and flip, exactly like production data.
const newestFirst = (chrono) => [...chrono].reverse()
const slot = (type, paid = false) => ({ session_type: type, paid, paid_via: paid ? 'payment' : null })

const chrono = (types) => types.map(t => slot(t))

test('F1 reported case: 1P+12G unpaid, payment entered 8P — settles all debt, credits 1P', () => {
  const unpaid = newestFirst(chrono(['private', ...Array(12).fill('group')]))
  const amountOwed = packagePrice(1, 12)
  const a = allocateFromSessions(unpaid, { amount: 8000, amountOwed, private_sessions: 8, group_sessions: 0 })

  assert.equal(a.covered_private, 1)
  assert.equal(a.covered_group, 12)
  assert.equal(a.credit_private, 1, 'must credit exactly 1P, never 7P')
  assert.equal(a.credit_group, 0)
  assert.deepEqual(a.remaining_unpaid, { private: 0, group: 0, amount: 0 })
  assert.equal(a.private_sessions, 8)
  assert.equal(a.group_sessions, 0)
  assert.equal(a.pool_value, 7200, 'the 8-pack now costs 7,200')
  assert.equal(a.cash_gap, 800, '8,000 paid for a 7,200 pack → 800 prepaid')
  assert.equal(a.warning, null, 'the amount now derives exactly 8P — entry matches')

  // settlement of covered slot-types against debt = -unpaid leaves exactly 0
  const settle = planSettlement(a.covered_private, a.covered_group, -1, -12)
  assert.equal(settle.settled_private, 1)
  assert.equal(settle.settled_group, 12)
  assert.deepEqual(settle.debt_after, { private: 0, group: 0 })
})

test('F2 conversion: 4 group slots used from an 8P payment — 2P consumed, 6P remain', () => {
  const unpaid = newestFirst(chrono(Array(4).fill('group')))
  const a = allocateFromSessions(unpaid, {
    amount: 8000, amountOwed: packagePrice(0, 4),
    private_sessions: 8, group_sessions: 0,
  })

  assert.equal(a.covered_group, 4, 'all 4 group slots covered')
  assert.equal(a.covered_private, 0)
  assert.equal(a.credit_private, 6, '4G consumed = 2P worth → 6P remain')
  assert.equal(a.credit_group, 0)
  assert.deepEqual(a.remaining_unpaid, { private: 0, group: 0, amount: 0 })

  const settle = planSettlement(0, 4, 0, -4)
  assert.deepEqual(settle.debt_after, { private: 0, group: 0 })
})

test('F3 money path unchanged: 9P unpaid, EGP 7,000 → the 16-group pack, covers 8P via conversion, 1P stays', () => {
  // 7,000 is exactly the group 16-pack (the private 8-pack is now 7,200) —
  // the pool converts: 2G per private slot, 8 of 9 private covered
  const unpaid = newestFirst(chrono(Array(9).fill('private')))
  const a = allocateFromSessions(unpaid, { amount: 7000, amountOwed: packagePrice(9, 0) })

  assert.equal(a.derived, true)
  assert.equal(a.private_sessions, 0)
  assert.equal(a.group_sessions, 16)
  assert.equal(a.covered_private, 8)
  assert.equal(a.credit_private, 0)
  assert.deepEqual(a.remaining_unpaid, { private: 1, group: 0, amount: packagePrice(1, 0) })
  assert.equal(a.warning, null)
})

test('F4 mixed explicit buckets: chronological order decides coverage, value preserved', () => {
  // chronological: G,G,G,P — entered 3G
  const unpaid = newestFirst(chrono(['group', 'group', 'group', 'private']))
  const a = allocateFromSessions(unpaid, { amount: 1500, amountOwed: packagePrice(1, 3), private_sessions: 0, group_sessions: 3 })
  assert.equal(a.covered_group, 3)
  assert.equal(a.credit_group, 0)
  assert.deepEqual(a.remaining_unpaid, { private: 1, group: 0, amount: 1000 })

  // entered 1P over the same list: first G converts (1P→2G), second G uses it,
  // P slot ends up uncovered (pool exhausted)
  const b = allocateFromSessions(unpaid, { amount: 1000, amountOwed: packagePrice(1, 3), private_sessions: 1, group_sessions: 0 })
  assert.equal(b.covered_group, 2)
  assert.equal(b.credit_private, 0)
  assert.equal(b.credit_group, 0)
  assert.deepEqual(b.remaining_unpaid, { private: 1, group: 1, amount: packagePrice(1, 1) })

  // balance settles to exactly what remains uncovered (debt mirrored unpaid)
  const settle = planSettlement(b.covered_private, b.covered_group, -1, -3)
  assert.deepEqual({ p: settle.debt_after.private, g: settle.debt_after.group },
    { p: b.remaining_unpaid.private, g: b.remaining_unpaid.group })
})

test('F5 reversal is exact: delete of the F1 payment restores the pre-payment buckets', () => {
  const unpaid = newestFirst(chrono(['private', ...Array(12).fill('group')]))
  const a = allocateFromSessions(unpaid, { amount: 8000, amountOwed: packagePrice(1, 12), private_sessions: 8, group_sessions: 0 })

  // pre-payment: legacy debt 1P+12G, no cycle
  const before = { private_balance: -1, group_balance: -12, cycle_private: 0, cycle_group: 0 }
  // F1 settlement applied: settleDebtWith(covered) then creditCycle(walk leftovers)
  const settle = planSettlement(a.covered_private, a.covered_group, before.private_balance, before.group_balance)
  const mid = {
    private_balance: before.private_balance + settle.settled_private,
    group_balance: before.group_balance + settle.settled_group,
    cycle_private: a.credit_private,
    cycle_group: a.credit_group,
  }
  assert.deepEqual(mid, { private_balance: 0, group_balance: 0, cycle_private: 1, cycle_group: 0 })

  const payment = {
    settled_private: a.covered_private, settled_group: a.covered_group,
    credited_private: a.credit_private, credited_group: a.credit_group,
  }
  const plan = planPaymentReversal(payment, mid)
  assert.equal(plan.newLegP, before.private_balance)
  assert.equal(plan.newLegG, before.group_balance)
  assert.equal(plan.newCycP, 0)
  assert.equal(plan.newCycG, 0)
})

test('F6 package-first (Yasin PAY-0035 reported case): 7P+1G unpaid, EGP 7,000 → 16G pool, all settled, 1G credited', () => {
  // chronological exactly like his slots: P(8/31), G(9/1... actually 9/2), then 6P
  // 7,000 = the group 16-pack exactly (the private 8-pack is 7,200 now); the
  // pool covers every slot via 1P=2G conversion, leaving 1G credit
  const unpaid = newestFirst(chrono(['private', 'group', ...Array(6).fill('private')]))
  const a = allocateFromSessions(unpaid, { amount: 7000, amountOwed: packagePrice(7, 1) })

  assert.equal(a.derived, true)
  assert.equal(a.private_sessions, 0)
  assert.equal(a.group_sessions, 16, 'the group 16-pack is the exact 7,000 fit')
  assert.deepEqual([a.covered_private, a.covered_group], [7, 1], 'everything owed gets settled')
  assert.deepEqual([a.credit_private, a.credit_group], [0, 1], '1 group session left over')
  assert.deepEqual(a.remaining_unpaid, { private: 0, group: 0, amount: 0 })
  assert.equal(a.warning, null)
  assert.equal(a.cash_gap, 0, 'exact pack → no cash gap')
})

// --- Best-Package Rule (locked spec) -------------------------------------

test('F7 Best-Package Farida: 18P+3G unpaid (17,700), EGP 15,500 → 16P+8G pack, all settled, −2,200 shortfall', () => {
  const unpaid = newestFirst(chrono([...Array(18).fill('private'), ...Array(3).fill('group')]))
  const a = allocateFromSessions(unpaid, { amount: 15500, amountOwed: packagePrice(18, 3) })

  assert.equal(a.derived, true)
  assert.equal(a.private_sessions, 16, 'debt pull → the 17,700 pack')
  assert.equal(a.group_sessions, 8)
  assert.equal(a.pool_value, 17700)
  assert.deepEqual([a.covered_private, a.covered_group], [18, 3], 'all 21 slots settled')
  assert.deepEqual([a.credit_private, a.credit_group], [0, 1], '16P+8G covers everything, 1G left')
  assert.deepEqual(a.remaining_unpaid, { private: 0, group: 0, amount: 0 })
  assert.equal(a.cash_gap, -2200, 'she paid 15,500 for a 17,700 pack → owes 2,200')
  assert.equal(a.cash_balance_after, -2200)
})

test('F8 ≤2-session exemption: small payments keep exact singles', () => {
  assert.equal(allocateFromSessions([], { amount: 1000, amountOwed: 0 }).private_sessions, 1)
  assert.equal(allocateFromSessions([], { amount: 1000, amountOwed: 0 }).group_sessions, 0)
  const s1500 = allocateFromSessions([], { amount: 1500, amountOwed: 0 })
  assert.deepEqual([s1500.private_sessions, s1500.group_sessions], [1, 1])
  const s2000 = allocateFromSessions([], { amount: 2000, amountOwed: 0 })
  assert.deepEqual([s2000.private_sessions, s2000.group_sessions], [2, 0])
  assert.equal(s2000.cash_gap, 0)
})

test('F9 cash ledger: shortfall clears first, prepaid carries forward, zero payment spends nothing', () => {
  // owes 1,500 cash, pays 5,000 → net 3,500 buys the (0,8) pack, cash lands on 0
  const clear = allocateFromSessions([], { amount: 5000, amountOwed: 0, cashBalance: -1500 })
  assert.deepEqual([clear.private_sessions, clear.group_sessions], [0, 8])
  assert.equal(clear.cash_gap, 1500)
  assert.equal(clear.cash_balance_after, 0)

  // prepaid +700, pays 1,800 → pack (0,4)=1,800 within cash, prepaid still there
  const prepaid = allocateFromSessions([], { amount: 1800, amountOwed: 0, cashBalance: 700 })
  assert.deepEqual([prepaid.private_sessions, prepaid.group_sessions], [0, 4])
  assert.equal(prepaid.cash_gap, 0)
  assert.equal(prepaid.cash_balance_after, 700)

  // zero payment never spends prepaid
  const zero = allocateFromSessions([], { amount: 0, amountOwed: 0, cashBalance: 700 })
  assert.deepEqual([zero.private_sessions, zero.group_sessions], [0, 0])
  assert.equal(zero.cash_gap, 0)
  assert.equal(zero.cash_balance_after, 700)
})

test('F10 explicit over-credit (Alaa PAY-0030): 6P+4G entered for 7,000 → −400 shortfall recorded, warning shown', () => {
  const unpaid = newestFirst(chrono([...Array(2).fill('private'), ...Array(4).fill('group')]))
  const a = allocateFromSessions(unpaid, {
    amount: 7000, amountOwed: packagePrice(2, 4),
    private_sessions: 6, group_sessions: 4,
  })
  assert.equal(a.derived, false)
  assert.deepEqual([a.private_sessions, a.group_sessions], [6, 4])
  assert.equal(a.pool_value, 7400)
  assert.equal(a.cash_gap, -400, 'pack costs 400 more than paid → collectible shortfall')
  assert.ok(a.warning, 'admin is told the entry differs from the derived pack')
})

test('simulateFifo: covered/uncovered counters, paid_via flags, external-paid bypass', () => {
  const walk = simulateFifo(1, 0, [{ session_type: 'group' }, { session_type: 'private' }, { session_type: 'group' }])
  // G converts the 1P (→ 2G, uses 1), 1G left pays the private slot? No:
  // G: p→0,g→1 (converted); private: g<2 → uncovered; group: g1→0 (payment)
  assert.deepEqual(walk.results, [
    { paid: true, paid_via: 'converted' },
    { paid: false, paid_via: null },
    { paid: true, paid_via: 'payment' },
  ])
  assert.deepEqual(walk.covered, { private: 0, group: 2 })
  assert.deepEqual(walk.uncovered, { private: 1, group: 0 })
  assert.deepEqual(walk.remaining, { private: 0, group: 0 })

  // externally-paid slots never touch the pool
  const ext = simulateFifo(0, 0, [{ session_type: 'private' }, { session_type: 'private' }],
    { isExternallyPaid: (s, i) => s.session_type === 'private' })
  assert.ok(ext.results.every(r => r.paid && r.paid_via === 'payment'))
  assert.deepEqual(ext.remaining, { private: 0, group: 0 })
  assert.deepEqual(ext.covered, { private: 0, group: 0 })
})

test('S1 staff rate: flat 600/300 — 3,000 pays exactly 5 private, no cash gap', () => {
  const unpaid = newestFirst(chrono(Array(5).fill('private')))
  const a = allocateFromSessions(unpaid, { amount: 3000, amountOwed: packagePrice(5, 0, { staff: true }), staff: true })
  assert.equal(a.derived, true)
  assert.equal(a.private_sessions, 5)
  assert.equal(a.pool_value, 3000)
  assert.equal(a.covered_private, 5)
  assert.equal(a.credit_private, 0)
  assert.equal(a.cash_gap, 0)
  assert.deepEqual(a.remaining_unpaid, { private: 0, group: 0, amount: 0 })
  assert.equal(a.warning, null)
})

test('S2 staff rate: 1,000 buys the value-max mix (1P+1G = 900), 100 prepaid, 2P stay unpaid', () => {
  const unpaid = newestFirst(chrono(Array(3).fill('private')))
  const a = allocateFromSessions(unpaid, { amount: 1000, amountOwed: packagePrice(3, 0, { staff: true }), staff: true })
  assert.equal(a.pool_value, 900)
  assert.equal(a.cash_gap, 100, '100 left as prepaid cash')
  assert.equal(a.covered_private, 1)
  assert.equal(a.credit_group, 1, 'the group the mix bought stays as credit')
  assert.deepEqual(a.remaining_unpaid, { private: 2, group: 0, amount: 1200 })
})

test('S3 staff rate: explicit 4G counts price at 300 each (1,200), not the 1,800 pack', () => {
  const unpaid = newestFirst(chrono(Array(4).fill('group')))
  const a = allocateFromSessions(unpaid, {
    amount: 1200, amountOwed: packagePrice(0, 4, { staff: true }),
    private_sessions: 0, group_sessions: 4, staff: true,
  })
  assert.equal(a.pool_value, 1200)
  assert.equal(a.cash_gap, 0)
  assert.equal(a.covered_group, 4)
  assert.equal(a.credit_group, 0)
  // entered counts win; the admin is told the amount alone would derive 2P
  assert.ok(a.warning)
  assert.match(a.warning, /Entered 0P \/ 4G/)
})
