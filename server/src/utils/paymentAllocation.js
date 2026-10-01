import { computePlayerSessions } from './sessionPaid.js'
import { bestCoverage, sessionsForAmount, packagePrice } from './pricing.js'

/**
 * Money-driven payment allocation.
 *
 * The amount paid decides what happens, in this order:
 *   1. Settle EXISTING unpaid sessions first — package-priced, so EGP 7,000
 *      covers 8 of 9 unpaid private sessions (8-pack) and leaves 1 unpaid.
 *   2. Whatever money is left over buys NEW sessions credited to the balance
 *      (after any negative balance has been settled — creditCycle does that).
 *
 * The payment row stores total sessions (covered + credited) so the paid-FIFO
 * keeps working, but only the credited part is given to creditCycle — covered
 * sessions were already consumed by the slots they pay for.
 *
 * When the caller passes explicit private_sessions/group_sessions (admin
 * override in the form) those totals win; the money still decides how much of
 * them settles old debt vs. is new credit.
 *
 * excludePaymentId — used while editing a payment so its own credit can't pay
 * for the sessions it is covering.
 */
export async function computePaymentAllocation(player, {
  amount = 0,
  private_sessions = undefined,
  group_sessions = undefined,
  excludePaymentId = null,
} = {}) {
  const paidAmount = Math.max(0, parseFloat(amount) || 0)
  const explicitCounts = private_sessions !== undefined || group_sessions !== undefined
  const explicitP = Math.max(0, parseInt(private_sessions, 10) || 0)
  const explicitG = Math.max(0, parseInt(group_sessions, 10) || 0)

  const { amountOwed, unpaidPrivate, unpaidGroup } = await computePlayerSessions(player, { excludePaymentId })

  // 1) money applied to the existing debt (package priced, never over it)
  const towardDebt = Math.min(paidAmount, amountOwed)
  const covered = bestCoverage(towardDebt, unpaidPrivate, unpaidGroup)

  // 2) leftover money buys new sessions (admin-entered counts win if given)
  const leftover = Math.max(0, paidAmount - covered.value)
  const autoCredit = leftover > 0 ? sessionsForAmount(leftover) : { private: 0, group: 0, value: 0 }
  const totalPrivate = explicitCounts ? explicitP : covered.private + autoCredit.private
  const totalGroup = explicitCounts ? explicitG : covered.group + autoCredit.group

  // 3) split the totals: money-settled part first, capped by what was entered
  const coverPrivate = Math.min(covered.private, totalPrivate)
  const coverGroup = Math.min(covered.group, totalGroup)
  const creditPrivate = totalPrivate - coverPrivate
  const creditGroup = totalGroup - coverGroup

  const remainingPrivate = unpaidPrivate - coverPrivate
  const remainingGroup = unpaidGroup - coverGroup

  return {
    derived: !explicitCounts,
    amount_owed: amountOwed,
    unpaid_before: { private: unpaidPrivate, group: unpaidGroup },
    covered_private: coverPrivate,
    covered_group: coverGroup,
    covered_value: packagePrice(coverPrivate, coverGroup),
    credit_private: creditPrivate,
    credit_group: creditGroup,
    private_sessions: totalPrivate,
    group_sessions: totalGroup,
    remaining_unpaid: {
      private: Math.max(0, remainingPrivate),
      group: Math.max(0, remainingGroup),
      amount: packagePrice(Math.max(0, remainingPrivate), Math.max(0, remainingGroup)),
    },
  }
}
