// Pricing for MM Padel Academy — per player, per 1-hour session, in EGP.
export const PRICING = {
  private: {
    name: 'Private Coaching',
    1: 1000,
    4: 3600,
    8: 7000,
    12: 10800,
    16: 14000,
  },
  group: {
    name: 'Group (2 Persons)',
    1: 500,
    4: 1800,
    8: 3500,
    16: 7000,
  },
}

// Staff exception — coaches and Magdy (member_code 007) pay a FLAT per-session
// rate, no packages. Mirrors server utils/pricing.js (STAFF_PRICING).
export const STAFF_PRICING = { private: 600, group: 300 }

/** A user on the staff rate: role coach, or member_code 007 (Magdy). */
export function isStaffRateUser(user) {
  if (!user) return false
  if (user.role === 'coach') return true
  return String(user.member_code ?? '').trim() === '007'
}

function tierFor(type, staff = false) {
  if (staff) return STAFF_PRICING[type] ? { 1: STAFF_PRICING[type] } : null
  return PRICING[type]
}

/** opts.staff → flat rate × count (no packages). */
export function calculatePrice(type, sessionCount, opts = {}) {
  const tier = tierFor(type, opts.staff)
  if (!tier) return 0
  const sessionCountNorm = Math.max(0, Math.floor(Number(sessionCount) || 0))
  if (tier[sessionCountNorm] !== undefined) return tier[sessionCountNorm]

  // For counts not covered by a tier, use a greedy approach with the largest bundles first.
  const tiers = Object.keys(tier)
    .map(Number)
    .filter(k => !isNaN(k) && k !== 1)
    .sort((a, b) => b - a)

  let remaining = sessionCountNorm
  let total = 0

  for (const t of tiers) {
    while (remaining >= t) {
      remaining -= t
      total += tier[t]
    }
  }
  // Singles at the per-session rate
  total += remaining * tier[1]
  return total
}

export function perSessionRate(type, sessionCount, opts = {}) {
  const tier = tierFor(type, opts.staff)
  if (tier && tier[sessionCount] !== undefined) {
    return tier[sessionCount] / sessionCount
  }
  // For greedy calculation, compute average rate
  if (tier) return calculatePrice(type, sessionCount, opts) / sessionCount
  return 0
}
