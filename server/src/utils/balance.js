import db from '../db.js'

/**
 * Centralized balance utilities — single source of truth for all
 * balance checks, deductions, credits, and reversals.
 *
 * Conversion rule: 1 Private session = 2 Group sessions.
 * When Group balance is insufficient and Private is available,
 * automatically convert: priv-1, group+2 (net: group uses one converted
 * session from Private).
 */

// ── Read-only checks ──────────────────────────────────────────────

/** Effective group balance = group + private*2 */
export function effectiveGroup(user) {
  const grp = user.group_balance || 0
  const priv = user.private_balance || 0
  return grp + priv * 2
}

/**
 * Does the user have enough balance for `count` sessions of `sessionType`?
 * Conversion-aware for group: accounts for private balance converting 1→2.
 */
export function hasEnoughBalance(user, sessionType, count = 1) {
  if (!user) return false
  if (sessionType === 'private') {
    return (user.private_balance || 0) >= count
  }
  if (sessionType === 'group') {
    return effectiveGroup(user) >= count
  }
  return false
}

// ── Mutation helpers (always called inside transactions) ───────────

/**
 * Deduct one session from user, conversion-aware.
 * Private: priv-1
 * Group: if grp>0 → grp-1; else if priv>0 → priv-1, grp+2 (net: priv-1, grp+1)
 *
 * Returns { success: boolean, newBalance: { private_balance, group_balance } | null }
 */
export async function deductBalance(userId, sessionType) {
  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return { success: false, newBalance: null }

    const priv = user.private_balance || 0
    const grp = user.group_balance || 0

    if (sessionType === 'private') {
      if (priv <= 0) return { success: false, newBalance: null }
      const newPriv = priv - 1
      await tx.update('users', userId, { private_balance: newPriv })
      return { success: true, newBalance: { private_balance: newPriv, group_balance: grp } }
    }

    if (sessionType === 'group') {
      if (grp > 0) {
        const newGrp = grp - 1
        await tx.update('users', userId, { group_balance: newGrp })
        return { success: true, newBalance: { private_balance: priv, group_balance: newGrp } }
      }
      if (priv > 0) {
        // Auto-convert: consume 1 private, credit 2 group, use 1 of the 2
        const newPriv = priv - 1
        const newGrp = grp + 1 // net: grp +2 -1 = grp +1
        await tx.update('users', userId, { private_balance: newPriv, group_balance: newGrp })
        return { success: true, newBalance: { private_balance: newPriv, group_balance: newGrp } }
      }
      return { success: false, newBalance: null }
    }

    return { success: false, newBalance: null }
  })
}

/**
 * Deduct allowing negative balance (admin override "deduct anyway").
 * Still uses conversion logic when possible — only goes negative
 * as a last resort (group when no private available).
 */
export async function deductBalanceAllowNegative(userId, sessionType) {
  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return { success: false, newBalance: null }

    const priv = user.private_balance || 0
    const grp = user.group_balance || 0

    if (sessionType === 'private') {
      const newPriv = priv - 1
      await tx.update('users', userId, { private_balance: newPriv })
      return { success: true, newBalance: { private_balance: newPriv, group_balance: grp } }
    }

    if (sessionType === 'group') {
      if (grp > 0) {
        const newGrp = grp - 1
        await tx.update('users', userId, { group_balance: newGrp })
        return { success: true, newBalance: { private_balance: priv, group_balance: newGrp } }
      }
      if (priv > 0) {
        const newPriv = priv - 1
        const newGrp = grp + 1
        await tx.update('users', userId, { private_balance: newPriv, group_balance: newGrp })
        return { success: true, newBalance: { private_balance: newPriv, group_balance: newGrp } }
      }
      // Allow negative
      const newGrp = grp - 1
      await tx.update('users', userId, { group_balance: newGrp })
      return { success: true, newBalance: { private_balance: priv, group_balance: newGrp } }
    }

    return { success: false, newBalance: null }
  })
}

/**
 * Credit balance (e.g. payment approval).
 */
export async function creditBalance(userId, sessionType, count = 1) {
  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return false
    const priv = user.private_balance || 0
    const grp = user.group_balance || 0
    if (sessionType === 'private') {
      await tx.update('users', userId, { private_balance: priv + count, balance_zero_since: null })
    } else if (sessionType === 'group') {
      await tx.update('users', userId, { group_balance: grp + count, balance_zero_since: null })
    }
    return true
  })
}

/**
 * Reverse a previously deducted balance (used on cancel/delete).
 * If group > 0, reverse by reducing group. Otherwise convert back:
 * add 1 private (reverse of the priv-1 used to convert).
 */
export async function reverseBalance(userId, sessionType) {
  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return false
    const priv = user.private_balance || 0
    const grp = user.group_balance || 0
    if (sessionType === 'private') {
      await tx.update('users', userId, { private_balance: priv - 1 })
    } else if (sessionType === 'group') {
      if (grp > 0) {
        await tx.update('users', userId, { group_balance: grp - 1 })
      } else {
        // Was converted from private → reverse: add 1 private
        await tx.update('users', userId, { group_balance: 0, private_balance: priv + 1 })
      }
    }
    return true
  })
}

/**
 * Update user balance with both fields at once, with balance_zero_since tracking.
 */
export async function updateUserBalance(userId, newPriv, newGrp) {
  const updates = { private_balance: newPriv, group_balance: newGrp }
  if (newPriv === 0 && newGrp === 0) {
    updates.balance_zero_since = new Date().toISOString()
  } else {
    updates.balance_zero_since = null
  }
  await db.update('users', userId, updates)
}
