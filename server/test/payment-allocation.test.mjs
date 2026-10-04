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

  // settlement of covered slot-types against debt = -unpaid leaves exactly 0
  const settle = planSettlement(a.covered_private, a.covered_group, -1, -12)
  assert.equal(settle.settled_private, 1)
  assert.equal(settle.settled_group, 12)
  assert.deepEqual(settle.debt_after, { private: 0, group: 0 })

  // entered counts diverge from what the money derives → admin is warned
  assert.ok(a.warning)
  assert.match(a.warning, /Entered 8P \/ 0G/)
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

test('F3 money path unchanged: 9P unpaid, EGP 7,000 → covers 8P, credits 0, 1P stays unpaid', () => {
  const unpaid = newestFirst(chrono(Array(9).fill('private')))
  const a = allocateFromSessions(unpaid, { amount: 7000, amountOwed: packagePrice(9, 0) })

  assert.equal(a.derived, true)
  assert.equal(a.private_sessions, 8)
  assert.equal(a.group_sessions, 0)
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
