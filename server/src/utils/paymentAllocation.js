import { computePlayerSessions } from './sessionPaid.js'
import { sessionsForAmount, packagePrice, nearestPackPool } from './pricing.js'
import { simulateFifo } from './convertBalance.js'

/**
 * Money-driven payment allocation — conversion-aware, PACKAGE-FIRST.
 *
 * The amount paid decides the session totals (Best-Package Rule):
 *   * pool ≤ 2 sessions → the exact value-max mix (singles allowed — the
 *     small-payment exemption),
 *   * pool > 2 sessions → the nearest single-tier pack sized by
 *     max(cash available, session debt) — never single-session rates.
 * pack_value − cash is the signed CASH GAP recorded on the ledger: negative
 * = shortfall paid next month (users.cash_balance), positive = prepaid
 * carried. Admin-entered totals (private_sessions/group_sessions) override
 * the derived pool; their gap is recorded too.
 *
 * Package-first (not "price the debt first") is deliberate: debt-first
 * fragmented bulk deals against fragments (7 private owed = 4-pack + 3 singles
 * = 6,600), shrinking an exact-7,000 package payment down to a 7-pool and
 * stranding 400 EGP with nowhere to go. Yasin Fathallah hit exactly this.
 * The cost of package-first is that a small debt + big payment can credit
 * discount-priced sessions — accepted, documented in docs/task_complete.md.
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
  return allocateFromSessions(sessions, {
    amountOwed,
    amount,
    private_sessions,
    group_sessions,
    cashBalance: Number(player.cash_balance) || 0,
  })
}

/**
 * Pure allocation core — same math, no database. `sessions` is the player's
 * session list NEWEST-FIRST exactly as computePlayerSessions returns it
 * (paid flags from the paid-FIFO already applied).
 */
export function allocateFromSessions(sessions, {
  amountOwed = 0,
  amount = 0,
  cashBalance = 0,
  private_sessions = undefined,
  group_sessions = undefined,
} = {}) {
  const paidAmount = Math.max(0, parseFloat(amount) || 0)
  const cashBefore = Number(cashBalance) || 0
  // Cash ledger order: an existing shortfall is paid off first, prepaid cash
  // adds to what this payment can buy. A zero payment never spends prepaid.
  const shortfallCleared = paidAmount > 0 && cashBefore < 0 ? Math.min(paidAmount, -cashBefore) : 0
  const prepaidUsed = paidAmount > 0 && cashBefore > 0 ? cashBefore : 0
  const netForPack = paidAmount > 0 ? paidAmount - shortfallCleared + prepaidUsed : 0

  const explicitCounts = private_sessions !== undefined || group_sessions !== undefined
  const explicitP = Math.max(0, parseInt(private_sessions, 10) || 0)
  const explicitG = Math.max(0, parseInt(group_sessions, 10) || 0)
  const unpaidPrivate = sessions.filter(s => !s.paid && s.session_type !== 'group').length
  const unpaidGroup = sessions.filter(s => !s.paid && s.session_type === 'group').length

  // 1) the amount buys the pool (admin-entered counts win if given):
  //    ≤ 2 sessions → exact value-max mix (singles allowed);
  //    else → nearest single-tier pack (Best-Package Rule).
  const valueMax = sessionsForAmount(netForPack)
  const derived = valueMax.private + valueMax.group <= 2
    ? valueMax
    : nearestPackPool(netForPack, amountOwed)
  const totalPrivate = explicitCounts ? explicitP : derived.private
  const totalGroup = explicitCounts ? explicitG : derived.group
  const poolValue = packagePrice(totalPrivate, totalGroup)

  // 2) conversion-aware split: FIFO over the unpaid slots (sessions list is
  //    newest-first — filter keeps that order, reverse restores chronological)
  const walk = simulateFifo(totalPrivate, totalGroup, sessions.filter(s => !s.paid).reverse())

  const creditPrivate = walk.remaining.private
  const creditGroup = walk.remaining.group
  const coverPrivate = walk.covered.private
  const coverGroup = walk.covered.group

  // Signed cash gap applied to users.cash_balance: negative = shortfall the
  // player owes next month, positive = prepaid carried forward.
  const cashGap = paidAmount - poolValue
  const cashAfter = cashBefore + cashGap

  // Entered counts diverging from what the amount itself derives — tell the admin.
  let warning = null
  if (explicitCounts && (explicitP !== derived.private || explicitG !== derived.group)) {
    warning = `Entered ${explicitP}P / ${explicitG}G differs from the amount-derived ${derived.private}P / ${derived.group}G.`
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
    pool_value: poolValue,
    cash_gap: cashGap,
    cash_balance_before: cashBefore,
    cash_balance_after: cashAfter,
    remaining_unpaid: {
      private: walk.uncovered.private,
      group: walk.uncovered.group,
      amount: packagePrice(walk.uncovered.private, walk.uncovered.group),
    },
    warning,
  }
}
