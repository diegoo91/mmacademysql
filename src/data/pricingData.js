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

export function calculatePrice(type, sessionCount) {
  const tier = PRICING[type]
  if (!tier) return 0
  if (tier[sessionCount] !== undefined) return tier[sessionCount]

  // For counts not covered by a tier, use a greedy approach with the largest bundles first.
  const tiers = Object.keys(tier)
    .map(Number)
    .filter(k => !isNaN(k) && k !== 1)
    .sort((a, b) => b - a)

  let remaining = sessionCount
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

export function perSessionRate(type, sessionCount) {
  const tier = PRICING[type]
  if (tier && tier[sessionCount] !== undefined) {
    return tier[sessionCount] / sessionCount
  }
  // For greedy calculation, compute average rate
  if (tier) return calculatePrice(type, sessionCount) / sessionCount
  return 0
}
