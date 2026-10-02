import { PRICING, calculatePrice } from '../data/pricingData.js'

/**
 * Unpaid → private-package advice, shared by receipt PDF, admin modal and
 * player detail. Mirrors server/_recommend-unpaid.mjs:
 *
 *   p_equiv  = P + G/2          (settlement rule 1P = 2G)
 *   nearest  = argmin |p_equiv - t| over tiers [1,4,8,12,16], tie -> larger
 *   roundUp  = smallest tier >= p_equiv (receipt "clear everything" option)
 *
 * Pure function over report sessions — never recomputes settlement truth,
 * only labels it (server remains source of truth for paid status).
 */

export const PRIVATE_TIERS = [1, 4, 8, 12, 16]

export function nearestPrivateTier(pEquiv) {
  let best = PRIVATE_TIERS[0]
  for (const t of PRIVATE_TIERS) {
    const d = Math.abs(t - pEquiv)
    const db = Math.abs(best - pEquiv)
    if (d < db || (d === db && t > best)) best = t
  }
  return best
}

export function roundUpPrivateTier(pEquiv) {
  for (const t of PRIVATE_TIERS) if (t >= pEquiv - 1e-9) return t
  return null // > 16 → 16-pack + singles
}

/**
 * @param {Array<{session_type?: string, paid?: boolean}>} sessions report sessions
 * @returns {{
 *   unpaidPrivate:number, unpaidGroup:number, pEquiv:number,
 *   nearest:number, nearestPrice:number,
 *   roundUp:number|null, roundUpPrice:number, roundUpSurplus:number,
 *   hasUnpaid:boolean
 * }}
 */
export function packageAdvice(sessions = []) {
  const unpaid = sessions.filter(s => !s.paid)
  const unpaidPrivate = unpaid.filter(s => s.session_type !== 'group').length
  const unpaidGroup = unpaid.filter(s => s.session_type === 'group').length
  const pEquiv = unpaidPrivate + unpaidGroup / 2
  const hasUnpaid = unpaidPrivate + unpaidGroup > 0
  const nearest = nearestPrivateTier(pEquiv)
  const nearestPrice = PRICING.private[nearest]
  const roundUp = roundUpPrivateTier(pEquiv)
  const roundUpPrice = roundUp
    ? PRICING.private[roundUp]
    : Math.ceil(pEquiv / 16) * PRICING.private[16]
  const packsNeeded = Math.ceil(pEquiv / 16)
  const remainderEquiv = roundUp ? 0 : Math.round((packsNeeded * 16 - pEquiv) * 10) / 10
  const roundUpSurplus = roundUp
    ? Math.max(0, Math.round((roundUp - pEquiv) * 10) / 10)
    : remainderEquiv
  const secondStep = roundUp ? null : roundUpPrivateTier(pEquiv - 16)
  const secondStepPrice = secondStep ? PRICING.private[secondStep] : 0

  return {
    unpaidPrivate,
    unpaidGroup,
    pEquiv,
    nearest,
    nearestPrice,
    roundUp,
    roundUpPrice,
    roundUpSurplus,
    packsNeeded,
    remainderEquiv,
    secondStep,
    secondStepPrice,
    hasUnpaid,
    unpaidValue: calculatePrice('private', unpaidPrivate) + calculatePrice('group', unpaidGroup),
  }
}
