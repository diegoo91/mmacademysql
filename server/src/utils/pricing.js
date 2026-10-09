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

// Staff exception (locked spec): coaches and Magdy (member_code 007) pay a
// FLAT per-session rate — no packages, no tiers. Applies to every money
// computation (amount owed, payment allocation, reports) for those users.
export const STAFF_PRICING = { private: 600, group: 300 }

/** A user on the staff rate: role coach, or Magdy's member_code 007. */
export function isStaffRateUser(user) {
  if (!user) return false
  if (user.role === 'coach') return true
  return String(user.member_code ?? '').trim() === '007'
}

/** Effective tier table for a user: flat singles for staff, packages otherwise. */
function tierFor(type, staff = false) {
  if (staff) return STAFF_PRICING[type] ? { 1: STAFF_PRICING[type] } : null
  return PRICING[type]
}

/** Greedy bundles (largest first), singles at the per-session rate.
 *  opts.staff → flat rate × count (no packages). */
export function calculatePrice(type, sessionCount, opts = {}) {
  const tier = tierFor(type, opts.staff)
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
export function packagePrice(privateCount = 0, groupCount = 0, opts = {}) {
  return calculatePrice('private', privateCount, opts) + calculatePrice('group', groupCount, opts)
}

// Precomputed price tables so coverage search is a cheap array lookup.
function priceTable(type, max, staff = false) {
  const table = new Array(max + 1)
  for (let i = 0; i <= max; i++) table[i] = calculatePrice(type, i, { staff })
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
export function bestCoverage(amount, maxPrivate = 0, maxGroup = 0, opts = {}) {
  const cap = Math.max(0, Math.floor(Number(amount) || 0))
  const maxP = Math.max(0, Math.floor(Number(maxPrivate) || 0))
  const maxG = Math.max(0, Math.floor(Number(maxGroup) || 0))
  if (cap <= 0 || (maxP === 0 && maxG === 0)) {
    return { private: 0, group: 0, value: 0 }
  }

  const pTable = priceTable('private', maxP, opts.staff)
  const gTable = priceTable('group', maxG, opts.staff)

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
 * Cheapest per-session rate in a tier table (e.g. private 16-pack = 875/session).
 * sessionsForAmount needs this — capping at the SINGLE rate assumes no session
 * ever costs less than one, which is false with bulk discounts and made the
 * 16-pack / 18-private answers unreachable (14,000 → 11P+9G instead of 16P).
 */
function cheapestRate(type, staff = false) {
  const tier = tierFor(type, staff)
  if (!tier) return 1
  let best = Infinity
  for (const [k, v] of Object.entries(tier)) {
    const n = Number(k)
    if (Number.isFinite(n) && n > 0) best = Math.min(best, v / n)
  }
  return Number.isFinite(best) && best > 0 ? best : 1
}

/**
 * Free credit for money that buys NEW sessions — same search but unbounded
 * (capped at what the cheapest per-session rate could ever buy, so bulk
 * packages are reachable: 14,000 → 16P, 16,000 → 18P).
 */
export function sessionsForAmount(amount, opts = {}) {
  const cap = Math.max(0, Math.floor(Number(amount) || 0))
  if (cap <= 0) return { private: 0, group: 0, value: 0 }
  const maxP = Math.ceil(cap / cheapestRate('private', opts.staff)) + 1
  const maxG = Math.ceil(cap / cheapestRate('group', opts.staff)) + 1
  return bestCoverage(cap, maxP, maxG, opts)
}

// ---------------------------------------------------------------------------
// Best-Package Rule (locked spec)
//
// A payment over 2 sessions is mapped to the NEAREST single-tier pack —
// never single-session rates:
//   * pack = (p, g) with p ∈ {0,4,8,12,16}, g ∈ {0,4,8,16} (each component a
//     named package tier, mixed pairs allowed — Farida's 16P+8G = 17,500),
//   * the pack is nearest to the CASH; upward packs may exceed it by at most
//     15% (the "don't cost them a lot" cap),
//   * DEBT PULL: when the cash-nearest pack is dusty (not an exact fit) AND
//     the session debt exceeds that pack, re-target to the debt — a player
//     clearing debt buys the pack that covers it (Farida's 16,000 against a
//     17,500 debt → the 17,500 pack, −1,500 owed). An exact cash pack is
//     never overridden (7,000 → the 8-pack stays, partial debt stays session
//     debt),
//   * ties → smaller pack (less owed), then more private,
//   * values above the (16,16) = 21,000 catalog peel (16,16) packs first.
//
// The difference cash − pack_value is the signed CASH GAP the caller records
// on the ledger: negative = shortfall the player pays next month, positive =
// prepaid cash carried forward. For pools ≤ 2 sessions the caller keeps the
// exact value-max mix (singles allowed) — the exemption for small payments.
// ---------------------------------------------------------------------------
export const PACK_PRIVATE_TIERS = [0, 4, 8, 12, 16]
export const PACK_GROUP_TIERS = [0, 4, 8, 16]
export const PACK_UPWARD_TOLERANCE = 0.15

export function nearestPackPool(amount, debt = 0, opts = {}) {
  // Staff has no packages — the pool is the exact flat-rate value-max mix.
  if (opts.staff) return sessionsForAmount(amount, opts)
  const a = Math.max(0, Number(amount) || 0)
  const d = Math.max(0, Number(debt) || 0)
  if (a <= 0) return { private: 0, group: 0, value: 0 }

  const maxPackValue = (PRICING.private[16] || 0) + (PRICING.group[16] || 0)

  const pickFor = (target) => {
    let remAmount = a
    let remTarget = target
    let peelP = 0
    let peelG = 0
    let peelValue = 0
    while (remTarget > maxPackValue && remAmount > maxPackValue) {
      peelP += 16
      peelG += 16
      peelValue += maxPackValue
      remTarget -= maxPackValue
      remAmount -= maxPackValue
    }
    const cap = remAmount * (1 + PACK_UPWARD_TOLERANCE)
    const EPS = 1e-6
    let best = null
    for (const p of PACK_PRIVATE_TIERS) {
      for (const g of PACK_GROUP_TIERS) {
        const value = (PRICING.private[p] || 0) + (PRICING.group[g] || 0)
        if (value > cap + EPS) continue
        const dist = Math.abs(value - remTarget)
        if (
          !best ||
          dist < best.dist ||
          (dist === best.dist && value < best.value) ||
          (dist === best.dist && value === best.value && p > best.p)
        ) {
          best = { p, g, value, dist }
        }
      }
    }
    if (!best) return { private: peelP, group: peelG, value: peelValue }
    return { private: peelP + best.p, group: peelG + best.g, value: peelValue + best.value }
  }

  const base = pickFor(a)
  const baseDist = Math.abs(base.value - a)
  // Debt pull: only when the cash-nearest pack is dusty AND the debt exceeds
  // it — an exact cash pack (7,000 → 8-pack) is never overridden.
  if (baseDist > 1e-6 && d > base.value + 1e-6) {
    const pulled = pickFor(Math.max(a, d))
    if (pulled.value >= base.value) return pulled
  }
  return base
}
