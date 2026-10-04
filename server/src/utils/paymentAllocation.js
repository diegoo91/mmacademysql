import { computePlayerSessions } from './sessionPaid.js'
import { bestCoverage, sessionsForAmount, packagePrice } from './pricing.js'
import { simulateFifo } from './convertBalance.js'

/**
 * Money-driven payment allocation — conversion-aware.
 *
 * The amount paid decides the session totals, in this order:
 *   1. Settle EXISTING unpaid sessions first — package-priced, so EGP 7,000
 *      covers 8 of 9 unpaid private sessions (8-pack) and leaves 1 unpaid.
 *   2. Whatever money is left over buys NEW sessions.
 * Admin-entered totals (private_sessions/group_sessions) override step 2.
 *
 * The covered/credit split is then derived by walking the player's UNPAID
 * slots FIFO with those totals through the SAME engine that marks slots paid
 * (utils/convertBalance.js / sessionPaid.js). So:
 *   - covered_private / covered_group  = slot TYPES the pool pays for
 *     (fed to settleDebtWith → converts against debt at 1P = 2G),
 *   - credit_private / credit_group    = pool leftovers → creditCycle
 *     (what remains as balance),
 *   - remaining_unpaid                 = slots the pool never reached.
 * The balance can therefore never disagree with the sessions list — the
 * historical "payment marked group slots paid but never settled the group
 * debt / showed phantom remaining" bug class.
 *
 * Value is preserved by planSettlement's 1P = 2G cross-bucket steps; count
 * sums across buckets are intentionally NOT equal (covered is slot-space,
 * credit is pool-space).
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
  const { sessions, amountOwed } = await computePlayerSessions(player, { excludePaymentId })
  return allocateFromSessions(sessions, { amountOwed, amount, private_sessions, group_sessions })
}

/**
 * Pure allocation core — same math, no database. `sessions` is the player's
 * session list NEWEST-FIRST exactly as computePlayerSessions returns it
 * (paid flags from the paid-FIFO already applied).
 */
export function allocateFromSessions(sessions, {
  amountOwed = 0,
  amount = 0,
  private_sessions = undefined,
  group_sessions = undefined,
} = {}) {
  const paidAmount = Math.max(0, parseFloat(amount) || 0)
  const explicitCounts = private_sessions !== undefined || group_sessions !== undefined
  const explicitP = Math.max(0, parseInt(private_sessions, 10) || 0)
  const explicitG = Math.max(0, parseInt(group_sessions, 10) || 0)
  const unpaidPrivate = sessions.filter(s => !s.paid && s.session_type !== 'group').length
  const unpaidGroup = sessions.filter(s => !s.paid && s.session_type === 'group').length

  // 1) money applied to the existing debt (package priced, never over it)
  const towardDebt = Math.min(paidAmount, amountOwed)
  const coverage = bestCoverage(towardDebt, unpaidPrivate, unpaidGroup)

  // 2) leftover money buys new sessions (admin-entered counts win if given)
  const leftover = Math.max(0, paidAmount - coverage.value)
  const autoCredit = leftover > 0 ? sessionsForAmount(leftover) : { private: 0, group: 0, value: 0 }
  const moneyPrivate = coverage.private + autoCredit.private
  const moneyGroup = coverage.group + autoCredit.group
  const totalPrivate = explicitCounts ? explicitP : moneyPrivate
  const totalGroup = explicitCounts ? explicitG : moneyGroup

  // 3) conversion-aware split: FIFO over the unpaid slots (sessions list is
  //    newest-first — filter keeps that order, reverse restores chronological)
  const walk = simulateFifo(totalPrivate, totalGroup, sessions.filter(s => !s.paid).reverse())

  const creditPrivate = walk.remaining.private
  const creditGroup = walk.remaining.group
  const coverPrivate = walk.covered.private
  const coverGroup = walk.covered.group

  // Entered counts diverging from what the amount itself derives — tell the admin.
  let warning = null
  if (explicitCounts && (explicitP !== moneyPrivate || explicitG !== moneyGroup)) {
    warning = `Entered ${explicitP}P / ${explicitG}G differs from the amount-derived ${moneyPrivate}P / ${moneyGroup}G.`
  }

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
      private: walk.uncovered.private,
      group: walk.uncovered.group,
      amount: packagePrice(walk.uncovered.private, walk.uncovered.group),
    },
    warning,
  }
}
