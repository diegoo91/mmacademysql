/**
 * Pure reversal planner for approved payments (edit/delete paths).
 *
 *   * settlement rows: take back only what this payment credited (floor at the
 *     current cycle remainder), then reinstate the debt it had forgiven
 *     (legacy may go negative again — that debt is real again).
 *   * pre-settlement rows: legacy behavior — sessions come out of the cycle
 *     first, the legacy remainder is floored at 0.
 *
 * Shared by routes/payments.js DELETE (remove row) and PUT edit (reverse +
 * re-credit new values); extracted so tests can pin the exactness contract.
 */
export function planPaymentReversal(payment, user) {
  const hasSettlement = payment.credited_private != null || payment.credited_group != null
  let cycP = Math.max(0, user.cycle_private || 0)
  let cycG = Math.max(0, user.cycle_group || 0)
  const rawLegP = Number(user.private_balance) || 0
  const rawLegG = Number(user.group_balance) || 0
  let newLegP, newLegG, reversal

  if (hasSettlement) {
    const credP = Math.max(0, payment.credited_private || 0)
    const credG = Math.max(0, payment.credited_group || 0)
    const backP = Math.min(credP, cycP)
    const backG = Math.min(credG, cycG)
    cycP -= backP
    cycG -= backG
    newLegP = rawLegP - Math.max(0, payment.settled_private || 0)
    newLegG = rawLegG - Math.max(0, payment.settled_group || 0)
    reversal = {
      cycle: { private: backP, group: backG },
      reinstated_debt: { private: Math.max(0, payment.settled_private || 0), group: Math.max(0, payment.settled_group || 0) },
      uncredited_shortfall: { private: credP - backP, group: credG - backG },
    }
  } else {
    const privSessions = payment.private_sessions || 0
    const grpSessions = payment.group_sessions || 0
    const takeP = Math.min(privSessions, cycP)
    const takeG = Math.min(grpSessions, cycG)
    cycP -= takeP
    cycG -= takeG
    newLegP = Math.max(0, Math.max(0, rawLegP) - (privSessions - takeP))
    newLegG = Math.max(0, Math.max(0, rawLegG) - (grpSessions - takeG))
    reversal = {
      cycle: { private: takeP, group: takeG },
      legacy: { private: privSessions - takeP, group: grpSessions - takeG },
    }
  }
  return { newLegP, newLegG, newCycP: cycP, newCycG: cycG, reversal, hasSettlement }
}
