/**
 * Shared FIFO conversion engine — the single source of truth for how paid
 * session credit is consumed by a player's scheduled slots.
 *
 * Conversion rule (locked): 1 Private = 2 Group.
 *
 * This loop historically lived in three places (utils/sessionPaid.js,
 * scripts/payments-rebuild.js, scripts/balance-audit.js) and drifted apart
 * from paymentAllocation.js's per-bucket split — the root cause of "payment
 * credited but group debt never settled / phantom remaining" bugs. All
 * consumers now call simulateFifo().
 *
 * Deliberately dependency-free (pure module) so scripts/ can import it
 * without booting the server or touching the database.
 */

export const GROUP_PER_PRIVATE = 2

/**
 * Walk slots in the given order (must already be chronological: date, then
 * time), consuming the paid-credit pool.
 *
 * Branch semantics (identical to the original sessionPaid.js loop):
 *   private slot → pool private first (paid_via 'payment'),
 *                  else 2 from pool group        (paid_via 'converted')
 *   group slot   → pool group first             (paid_via 'payment'),
 *                  else 1 from pool private (leaves +1 group, since 1P
 *                  converts to 2G and the slot uses one)  (paid_via 'converted')
 *
 * @param {number} poolPrivate - paid private credit available
 * @param {number} poolGroup - paid group credit available
 * @param {Array<{session_type?: string}>} slots - rows; session_type 'group'
 *        (anything else counts as private, matching the historical fallback)
 * @param {{ isExternallyPaid?: (slot: any) => boolean }} [opts] - slots
 *        already settled by a direct booking/payment link: marked paid
 *        WITHOUT touching the pool (same as the old directPayment bypass).
 * @returns {{
 *   results: Array<{paid: boolean, paid_via: 'payment'|'converted'|null}>,
 *   remaining: {private: number, group: number},   // pool leftovers = correct credit
 *   covered: {private: number, group: number},     // pool-driven paid slots by type
 *   uncovered: {private: number, group: number},   // pool-driven unpaid slots by type
 * }}
 * `results` aligns 1:1 with the input array order.
 */
export function simulateFifo(poolPrivate, poolGroup, slots, { isExternallyPaid = null } = {}) {
  let p = Math.max(0, parseInt(poolPrivate, 10) || 0)
  let g = Math.max(0, parseInt(poolGroup, 10) || 0)
  const results = []
  const covered = { private: 0, group: 0 }
  const uncovered = { private: 0, group: 0 }

  for (const slot of slots) {
    if (isExternallyPaid && isExternallyPaid(slot)) {
      results.push({ paid: true, paid_via: 'payment' })
      continue
    }
    const type = slot?.session_type === 'group' ? 'group' : 'private'
    let paid = false
    let via = null
    if (type === 'private') {
      if (p > 0) { p -= 1; paid = true; via = 'payment' }
      else if (g >= 2) { g -= 2; paid = true; via = 'converted' }
    } else {
      if (g > 0) { g -= 1; paid = true; via = 'payment' }
      else if (p > 0) { p -= 1; g += 1; paid = true; via = 'converted' }
    }
    if (paid) covered[type] += 1
    else uncovered[type] += 1
    results.push({ paid, paid_via: paid ? via : null })
  }

  return { results, remaining: { private: p, group: g }, covered, uncovered }
}
