import { PRICING, calculatePrice } from '../data/pricingData.js'

/**
 * Unpaid → private-package advice, shared by receipt PDF, admin modal and
 * player detail. Mirrors server/_recommend-unpaid.mjs:
 *
 *   p_equiv  = P + G/2          (settlement rule 1P = 2G)
 *   nearest  = argmin |p_equiv - t| over tiers [1,4,8,12,16], tie -> larger
 *   clearAll = smallest tier pack that covers every unpaid session and pays
 *              at an EXACT pack price (receipt "clear everything" option;
 *              roundUp/secondStep below are legacy private-only fields kept
 *              for old consumers)
 *
 * Pure function over report sessions — never recomputes settlement truth,
 * only labels it (server remains source of truth for paid status).
 */

export const PRIVATE_TIERS = [1, 4, 8, 12, 16]

// ---------------------------------------------------------------------------
// Clear-all pack — mirrors the server's Best-Package Rule (pricing.js
// nearestPackPool + paymentAllocation) so the advice says "pay EGP X and
// every unpaid session is covered", where X resolves to an EXACT pool on the
// server (cash_gap = 0):
//   * tier packs: p ∈ {0,4,8,12,16}, g ∈ {0,4,8,16} — peel (16,16) = 21,000
//     packs above the catalog, same as server pickFor,
//   * the allocator's ≤2-session singles exemption: 1G=500, 1P=1000,
//     1P+1G=1500, 2P=2000 (exact value-max mixes),
//   * COVERAGE: pool units (1P = 2 units, 1G = 1 unit — the locked 1P = 2G
//     conversion) must be ≥ debt units, so the FIFO walk clears every slot,
//   * smallest price wins, tie → more private.
// ---------------------------------------------------------------------------
const TIER_PRIVATE = [0, 4, 8, 12, 16]
const TIER_GROUP = [0, 4, 8, 16]
const MAX_PACK_VALUE = PRICING.private[16] + PRICING.group[16] // (16,16) = 21,000
const SINGLES_MIXES = [
  { private: 0, group: 1, price: PRICING.group[1] },
  { private: 1, group: 0, price: PRICING.private[1] },
  { private: 1, group: 1, price: PRICING.private[1] + PRICING.group[1] },
  { private: 2, group: 0, price: 2 * PRICING.private[1] },
]

export function clearAllPack(unpaidPrivate, unpaidGroup) {
  const debtUnits = unpaidPrivate * 2 + unpaidGroup
  if (debtUnits <= 0) return null
  const debtValue = calculatePrice('private', unpaidPrivate) + calculatePrice('group', unpaidGroup)
  const candidates = [...SINGLES_MIXES]
  const maxPeels = Math.ceil(Math.max(debtValue / MAX_PACK_VALUE, debtUnits / 48))
  for (let peel = 0; peel <= maxPeels; peel++) {
    for (const p of TIER_PRIVATE) {
      for (const g of TIER_GROUP) {
        candidates.push({
          private: peel * 16 + p,
          group: peel * 16 + g,
          price: peel * MAX_PACK_VALUE + (PRICING.private[p] || 0) + (PRICING.group[g] || 0),
        })
      }
    }
  }
  const feasible = candidates.filter(c => c.private * 2 + c.group >= debtUnits)
  feasible.sort((a, b) => a.price - b.price || b.private - a.private)
  if (!feasible.length) return null
  const best = feasible[0]
  best.label = [best.private ? `${best.private}P` : null, best.group ? `${best.group}G` : null].filter(Boolean).join('+')
  return best
}

/**
 * FIFO credit split — port of server utils/convertBalance.js simulateFifo
 * (1 Private = 2 Group; private slot → pool P else 2G; group slot → pool G
 * else 1P leaving +1G). `sessions` is report order (newest first) — walked
 * chronologically, same as paymentAllocation. Returns pool leftovers = the
 * credit a clear-all payment would add on top of covering everything.
 */
function fifoCredit(poolPrivate, poolGroup, unpaidSessions) {
  let p = Math.max(0, poolPrivate)
  let g = Math.max(0, poolGroup)
  const chronological = [...unpaidSessions].reverse()
  for (const s of chronological) {
    if (s.session_type === 'group') {
      if (g > 0) g -= 1
      else if (p > 0) { p -= 1; g += 1 }
    } else {
      if (p > 0) p -= 1
      else if (g >= 2) g -= 2
    }
  }
  return { private: p, group: g }
}

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
 *   clearAll:{private,group,price,label,credit,creditSessions}|null,
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

  const clearAll = clearAllPack(unpaidPrivate, unpaidGroup)
  if (clearAll) {
    clearAll.credit = fifoCredit(clearAll.private, clearAll.group, unpaid)
    clearAll.creditSessions = clearAll.credit.private + clearAll.credit.group
  }

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
    clearAll,
  }
}
