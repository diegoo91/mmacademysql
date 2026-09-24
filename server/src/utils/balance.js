import db from '../db.js'
import {
  effectivePrivate,
  effectiveGroupBalance,
  ensureCycleFresh,
  deductBalanceCycle,
  reverseBalanceCycle,
  creditCycle,
} from './cycle.js'

/**
 * Centralized balance utilities — single source of truth for all
 * balance checks, deductions, credits, and reversals.
 *
 * Conversion rule: 1 Private session = 2 Group sessions.
 * Monthly cycle model: new payments live in cycle_* buckets and expire
 * ~14th of the following month; grandfathered private_balance/group_balance
 * never expire. Reads/deducts always go through ensureCycleFresh (lazy).
 *
 * Re-exported cycle helpers keep one import surface for routes.
 */
export {
  effectivePrivate,
  effectiveGroupBalance,
  ensureCycleFresh,
  creditCycle,
  monthlyDisplay,
  hasActiveCycle,
  hasLegacyBalance,
  isCycleExpired,
  currentCycleKey,
  cycleExpiryFor,
  runBalanceCycleSweep,
  notifyUpcomingExpiry,
} from './cycle.js'

// ── Read-only checks ──────────────────────────────────────────────

/** Effective group balance = legacy(group+priv*2) + cycle(group+priv*2) */
export function effectiveGroup(user) {
  return effectiveGroupBalance(user)
}

/** Effective private = legacy private + active cycle private (clamped ≥ 0). */
export function effectivePriv(user) {
  return effectivePrivate(user)
}

/**
 * Does the user have enough balance for `count` sessions of `sessionType`?
 * Conversion-aware for group: accounts for private balance converting 1→2.
 * Lazily expires a past cycle before measuring.
 */
export async function hasEnoughBalance(user, sessionType, count = 1) {
  if (!user) return false
  const fresh = await ensureCycleFresh(user, { notify: false })
  const u = fresh || user
  if (sessionType === 'private') {
    return effectivePrivate(u) >= count
  }
  if (sessionType === 'group') {
    return effectiveGroupBalance(u) >= count
  }
  return false
}

// ── Mutation helpers (always called inside transactions when needed) ──

/**
 * Deduct one session from user, conversion-aware, dual-path
 * (cycle first, then grandfathered legacy).
 * Returns { success: boolean, newBalance: {...} | null }
 */
export async function deductBalance(userId, sessionType) {
  return deductBalanceCycle(userId, sessionType, { allowNegative: false })
}

/**
 * Deduct allowing negative balance (admin override "deduct anyway").
 * Only the legacy bucket may go negative as a last resort.
 */
export async function deductBalanceAllowNegative(userId, sessionType) {
  return deductBalanceCycle(userId, sessionType, { allowNegative: true })
}

/**
 * Credit a payment approval into the MONTHLY CYCLE bucket.
 * Does not touch grandfathered legacy balances; expired prior cycles
 * are audit-logged and cleared first (payments do not stack on old remaining).
 */
export async function creditBalance(userId, sessionType, count = 1) {
  const n = Math.max(0, parseInt(count, 10) || 0)
  if (n === 0) return true
  const privateAdd = sessionType === 'private' ? n : 0
  const groupAdd = sessionType === 'group' ? n : 0
  const result = await creditCycle(userId, privateAdd, groupAdd)
  return !!result?.ok
}

/** Credit both buckets at once (payment with private_sessions + group_sessions). */
export async function creditBalanceBoth(userId, privateCount, groupCount) {
  const result = await creditCycle(userId, privateCount, groupCount)
  return !!result?.ok
}

/**
 * Reverse a previously deducted balance (used on cancel/delete).
 * Returns to the live cycle bucket if one is active, else legacy.
 * Floor at 0 per bucket.
 */
export async function reverseBalance(userId, sessionType) {
  return reverseBalanceCycle(userId, sessionType)
}

/**
 * Update user balance with both fields at once, with balance_zero_since tracking.
 * Admin manual edit of LEGACY balances only (cycle is system-managed).
 */
export async function updateUserBalance(userId, newPriv, newGrp) {
  const updates = { private_balance: Math.max(0, newPriv), group_balance: Math.max(0, newGrp) }
  if (updates.private_balance === 0 && updates.group_balance === 0) {
    const user = await db.get('users', userId)
    const cycP = user?.cycle_private || 0
    const cycG = user?.cycle_group || 0
    if (cycP === 0 && cycG === 0) updates.balance_zero_since = new Date().toISOString()
    else updates.balance_zero_since = null
  } else {
    updates.balance_zero_since = null
  }
  await db.update('users', userId, updates)
}
