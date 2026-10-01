/**
 * Package pricing — single source of truth on the server for what a set of
 * sessions costs under the academy packages.
 *
 * Mirrors the public frontend table in src/data/pricingData.js (PRICING +
 * calculatePrice). Keep both in sync when packages change.
 *
 * Used by:
 *   - utils/sessionPaid.js  → amount_owed of unpaid sessions (package priced)
 *   - utils/paymentAllocation.js → money-driven payment → session counts
 */

export const PRICING = {
  private: { 1: 1000, 4: 3600, 8: 7000, 12: 10800, 16: 14000 },
  group: { 1: 500, 4: 1800, 8: 3500, 16: 7000 },
}

/** Greedy bundles (largest first), singles at the per-session rate. */
export function calculatePrice(type, sessionCount) {
  const tier = PRICING[type]
  const n = Math.max(0, Math.floor(Number(sessionCount) || 0))
  if (!tier) return 0
  if (tier[n] !== undefined) return tier[n]

  const tiers = Object.keys(tier)
    .map(Number)
    .filter(k => !isNaN(k) && k !== 1)
    .sort((a, b) => b - a)

  let remaining = n
  let total = 0
  for (const t of tiers) {
    while (remaining >= t) {
      remaining -= t
      total += tier[t]
    }
  }
  total += remaining * tier[1]
  return total
}

/** Package price of a (private, group) pair — what the player owes/should pay. */
export function packagePrice(privateCount = 0, groupCount = 0) {
  return calculatePrice('private', privateCount) + calculatePrice('group', groupCount)
}

// Precomputed price tables so coverage search is a cheap array lookup.
function priceTable(type, max) {
  const table = new Array(max + 1)
  for (let i = 0; i <= max; i++) table[i] = calculatePrice(type, i)
  return table
}

/**
 * How many of a player's unpaid sessions does `amount` EGP cover?
 *
 * Picks (private ≤ maxPrivate, group ≤ maxGroup) that SPENDS the most value
 * without exceeding `amount` — ties broken toward more private sessions
 * (private is the primary product), then more sessions.
 *
 * Examples (9 unpaid private, amount 7,000) → (8, 0): the 8-pack is 7,000,
 * so 8 sessions are covered and 1 stays unpaid.
 * Examples (16 unpaid private + 3 unpaid group, amount 15,500) → (16, 3).
 */
export function bestCoverage(amount, maxPrivate = 0, maxGroup = 0) {
  const cap = Math.max(0, Math.floor(Number(amount) || 0))
  const maxP = Math.max(0, Math.floor(Number(maxPrivate) || 0))
  const maxG = Math.max(0, Math.floor(Number(maxGroup) || 0))
  if (cap <= 0 || (maxP === 0 && maxG === 0)) {
    return { private: 0, group: 0, value: 0 }
  }

  const pTable = priceTable('private', maxP)
  const gTable = priceTable('group', maxG)

  let best = { private: 0, group: 0, value: -1 }
  for (let p = 0; p <= maxP; p++) {
    const pv = pTable[p]
    if (pv > cap) break
    for (let g = 0; g <= maxG; g++) {
      const value = pv + gTable[g]
      if (value > cap) break
      if (
        value > best.value ||
        (value === best.value && p > best.private) ||
        (value === best.value && p === best.private && (p + g) > (best.private + best.group))
      ) {
        best = { private: p, group: g, value }
      }
    }
  }
  if (best.value < 0) return { private: 0, group: 0, value: 0 }
  return best
}

/**
 * Free credit for leftover money that covers nothing unpaid — same search but
 * unbounded (capped at what the single-session rates could ever buy).
 */
export function sessionsForAmount(amount) {
  const cap = Math.max(0, Math.floor(Number(amount) || 0))
  if (cap <= 0) return { private: 0, group: 0, value: 0 }
  const maxP = Math.ceil(cap / PRICING.private[1]) + 1
  const maxG = Math.ceil(cap / PRICING.group[1]) + 1
  return bestCoverage(cap, maxP, maxG)
}
