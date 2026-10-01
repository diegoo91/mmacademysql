import db from '../db.js'
import { auditLog } from '../middleware/audit.js'
import { notifyUser } from './notify.js'

/**
 * Monthly cycle balance model.
 *
 * Dual paths on users:
 *   - Legacy (grandfathered): private_balance / group_balance — never expire.
 *   - Cycle (new payments):   cycle_private / cycle_group — expire on
 *     cycle_expires_at (~14th of the following calendar month).
 *
 * Rules (locked):
 *   - Applies to Private + Group.
 *   - New payments first SETTLE any negative legacy debt (own bucket, then
 *     cross-bucket at 1 Private = 2 Group in exact value-preserving steps);
 *     only the remainder is credited to the cycle.
 *   - New payments do NOT accumulate onto legacy; they start/replace the cycle.
 *   - Same-cycle payments add to the active cycle.
 *   - Never show or store a negative effective balance for display
 *     (admin surfaces show explicit debt_* magnitudes instead).
 *   - Expiry is audit-logged: paid X / used Y / expired Z.
 *   - Lazy expiry on read + admin-triggered rollover + interval sweep.
 */

export const EXPIRY_DAY_OF_MONTH = 14

export function currentCycleKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** ~14th of the following calendar month, 23:59:59 local → stored UTC-ish ISO */
export function cycleExpiryFor(key = currentCycleKey()) {
  const [y, m] = key.split('-').map(Number)
  const exp = new Date(y, m, EXPIRY_DAY_OF_MONTH, 23, 59, 59, 999)
  return exp.toISOString().replace('T', ' ').slice(0, 19)
}

export function isCycleExpired(user, now = new Date()) {
  if (!user?.cycle_expires_at) return false
  return new Date(user.cycle_expires_at) < now
}

export function hasActiveCycle(user) {
  if (!user) return false
  if (!user.cycle_key) return false
  if (isCycleExpired(user)) return false
  return (user.cycle_private || 0) > 0 || (user.cycle_group || 0) > 0
}

export function hasLegacyBalance(user) {
  if (!user) return false
  return (user.private_balance || 0) > 0 || (user.group_balance || 0) > 0
}

/** Total remaining for checks: legacy + active cycle (clamped ≥ 0). */
export function effectivePrivate(user) {
  if (!user) return 0
  const leg = Math.max(0, user.private_balance || 0)
  const cyc = isCycleExpired(user) ? 0 : Math.max(0, user.cycle_private || 0)
  return leg + cyc
}

export function effectiveGroupBalance(user) {
  if (!user) return 0
  const leg = Math.max(0, user.group_balance || 0)
  const legPriv = Math.max(0, user.private_balance || 0)
  const cyc = isCycleExpired(user) ? 0 : Math.max(0, user.cycle_group || 0)
  const cycPriv = isCycleExpired(user) ? 0 : Math.max(0, user.cycle_private || 0)
  return leg + legPriv * 2 + cyc + cycPriv * 2
}

/** What the player sees for "this month" — cycle only, clamped. */
export function monthlyDisplay(user) {
  if (!user) return { private: 0, group: 0, expires_at: null, legacy_private: 0, legacy_group: 0, paid_this_cycle: false }
  const expired = isCycleExpired(user)
  return {
    private: expired ? 0 : Math.max(0, user.cycle_private || 0),
    group: expired ? 0 : Math.max(0, user.cycle_group || 0),
    expires_at: expired ? null : user.cycle_expires_at || null,
    cycle_key: expired ? null : user.cycle_key || null,
    legacy_private: Math.max(0, user.private_balance || 0),
    legacy_group: Math.max(0, user.group_balance || 0),
    paid_this_cycle: hasActiveCycle(user),
  }
}

/**
 * Lazily expire an active-but-past cycle for this user.
 * Writes audit log (paid/used/expired) + notifications. Idempotent.
 */
export async function ensureCycleFresh(userOrId, { req = null, notify = true } = {}) {
  let user = typeof userOrId === 'object' && userOrId !== null
    ? userOrId
    : await db.get('users', userOrId)
  if (!user) return null
  if (!user.cycle_key || !user.cycle_expires_at) return user
  if (new Date(user.cycle_expires_at) >= new Date()) return user
  if ((user.cycle_private || 0) === 0 && (user.cycle_group || 0) === 0) {
    // Already zeroed — just clear stamp if needed
    if (user.cycle_key) {
      await db.update('users', user.id, { cycle_key: null, cycle_expires_at: null })
      user = { ...user, cycle_key: null, cycle_expires_at: null }
    }
    return user
  }

  const paidPrivate = user.cycle_private_paid || 0
  const paidGroup = user.cycle_group_paid || 0
  const remPrivate = Math.max(0, user.cycle_private || 0)
  const remGroup = Math.max(0, user.cycle_group || 0)
  const usedPrivate = Math.max(0, paidPrivate - remPrivate)
  const usedGroup = Math.max(0, paidGroup - remGroup)

  const before = {
    cycle_key: user.cycle_key,
    cycle_private: user.cycle_private,
    cycle_group: user.cycle_group,
    cycle_expires_at: user.cycle_expires_at,
  }
  const after = {
    cycle_key: null,
    cycle_private: 0,
    cycle_group: 0,
    cycle_expires_at: null,
    cycle_private_paid: 0,
    cycle_group_paid: 0,
    expired: {
      cycle_key: user.cycle_key,
      paid: { private: paidPrivate, group: paidGroup },
      used: { private: usedPrivate, group: usedGroup },
      expired: { private: remPrivate, group: remGroup },
      at: new Date().toISOString(),
    },
  }

  await db.update('users', user.id, {
    cycle_private: 0,
    cycle_group: 0,
    cycle_key: null,
    cycle_expires_at: null,
    cycle_private_paid: 0,
    cycle_group_paid: 0,
  })

  await auditLog({
    req,
    action: 'balance.cycle_expired',
    targetType: 'user',
    targetId: user.id,
    before,
    after,
  })

  if (notify) {
    const body = `Your ${user.cycle_key} session package expired. Used ${usedPrivate} private / ${usedGroup} group; ${remPrivate} private / ${remGroup} group expired.`
    await notifyUser({
      userId: user.id, kind: 'balance_expired',
      title: 'Session package expired', body, link: '/profile',
    }).catch(() => {})
    try {
      const admins = await db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
      for (const a of admins) {
        await notifyUser({
          userId: a.id, kind: 'balance_expired',
          title: 'Player package expired',
          body: `${user.name}: ${user.cycle_key} package expired (${remPrivate}P / ${remGroup}G unused).`,
          link: '/admin',
        }).catch(() => {})
      }
    } catch { /* non-fatal */ }
  }

  return { ...user, cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null, cycle_private_paid: 0, cycle_group_paid: 0 }
}

/** Notify players whose cycle expires within `days` (default 3). Idempotent via notification body match. */
export async function notifyUpcomingExpiry(days = 3) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)
  const players = await db.findAll('users', u => u.role === 'player' && u.cycle_expires_at)
  let sent = 0
  for (const p of players) {
    if ((p.cycle_private || 0) === 0 && (p.cycle_group || 0) === 0) continue
    const exp = new Date(p.cycle_expires_at)
    if (Number.isNaN(exp.getTime()) || exp > cutoff || exp < new Date()) continue
    const body = `Your session package (${p.cycle_key}) expires ${p.cycle_expires_at.slice(0, 10)}. Remaining: ${p.cycle_private || 0} private / ${p.cycle_group || 0} group.`
    const existing = await db.findAll('notifications', n => n.user_id === p.id && n.kind === 'balance_expiring')
    if (existing.some(n => n.body === body)) continue
    await notifyUser({
      userId: p.id, kind: 'balance_expiring',
      title: 'Session package expiring soon', body, link: '/profile',
    }).catch(() => {})
    sent++
  }
  return sent
}

/** Sweep all players: expire past cycles + upcoming notices. Returns counts. */
export async function runBalanceCycleSweep({ upcomingDays = 3 } = {}) {
  const players = await db.findAll('users', u => u.role === 'player')
  let expired = 0
  for (const p of players) {
    const before = p.cycle_key
    const after = await ensureCycleFresh(p, { notify: true })
    if (after && before && !after.cycle_key) expired++
  }
  const upcoming = await notifyUpcomingExpiry(upcomingDays)
  return { expired, upcoming, at: new Date().toISOString() }
}

/**
 * Pure settlement planner: how an incoming payment of (pAdd, gAdd) sessions
 * offsets a player's NEGATIVE legacy balance before the remainder is credited.
 *
 * Rules (locked, value-preserving at 1 Private = 2 Group):
 *   1) Private credit vs private debt (own bucket first).
 *   2) Group credit vs group debt (own bucket).
 *   3) Cross: private credit converts to a group pool (1P → 2G); debt takes
 *      from the pool, leftovers are still credited as group.
 *   4) Cross: group credit converts to private (2G → 1P) in exact pairs;
 *      an odd leftover group credit stays as group.
 * Positive legacy buckets and the cycle are never touched by settlement.
 *
 * Returns integers only:
 *   settled_private/settled_group — legacy debt forgiven (how far legacy moved toward 0)
 *   credited_private/credited_group — remainder that enters the cycle
 *   debt_before/debt_after — debt magnitudes (≥ 0) per bucket
 */
export function planSettlement(privateAdd, groupAdd, rawLegP, rawLegG) {
  const p0 = Math.max(0, parseInt(privateAdd, 10) || 0)
  const g0 = Math.max(0, parseInt(groupAdd, 10) || 0)
  const legP = Number(rawLegP) || 0
  const legG = Number(rawLegG) || 0
  const debtP = Math.max(0, -legP)
  const debtG = Math.max(0, -legG)

  let p = p0
  let g = g0
  let forgivenP = 0
  let forgivenG = 0

  // 1) own bucket — private credit vs private debt
  const ownP = Math.min(p, debtP)
  p -= ownP
  forgivenP += ownP

  // 2) own bucket — group credit vs group debt
  const ownG = Math.min(g, debtG - forgivenG)
  g -= ownG
  forgivenG += ownG

  // 3) cross — private credit vs group debt (1P → pool of 2G)
  const remG = debtG - forgivenG
  if (remG > 0 && p > 0) {
    const useP = Math.min(p, Math.ceil(remG / 2))
    p -= useP
    const pool = useP * 2
    const cover = Math.min(remG, pool)
    forgivenG += cover
    g += pool - cover // leftover group units from the conversion are still credited
  }

  // 4) cross — group credit vs private debt (2G → 1P, exact pairs)
  const remP = debtP - forgivenP
  if (remP > 0 && g > 0) {
    const useG = Math.min(g, remP * 2)
    const cover = Math.min(remP, Math.floor(useG / 2))
    g -= cover * 2
    forgivenP += cover
  }

  return {
    settled_private: forgivenP,
    settled_group: forgivenG,
    credited_private: p,
    credited_group: g,
    debt_before: { private: debtP, group: debtG },
    debt_after: { private: debtP - forgivenP, group: debtG - forgivenG },
  }
}

/**
 * Settle (part of) the player's NEGATIVE legacy balance with `privateAdd` /
 * `groupAdd` sessions WITHOUT crediting anything to the cycle.
 *
 * Used for the part of a payment that pays for sessions already played:
 * those sessions are consumed by the slots they cover, so nothing may enter
 * the cycle — but any debt they offset must actually disappear.
 * Returns { ok, settlement } where settlement.credited_* is meaningless here
 * (it is dropped on purpose).
 */
export async function settleDebtWith(userId, privateAdd = 0, groupAdd = 0) {
  const pAdd = Math.max(0, parseInt(privateAdd, 10) || 0)
  const gAdd = Math.max(0, parseInt(groupAdd, 10) || 0)
  const empty = {
    settled_private: 0, settled_group: 0,
    credited_private: 0, credited_group: 0,
    debt_before: { private: 0, group: 0 }, debt_after: { private: 0, group: 0 },
  }
  if (pAdd === 0 && gAdd === 0) return { ok: true, settlement: empty }

  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return { ok: false, settlement: empty }

    const settlement = planSettlement(pAdd, gAdd, user.private_balance, user.group_balance)
    if (settlement.settled_private > 0 || settlement.settled_group > 0) {
      const newLegP = (Number(user.private_balance) || 0) + settlement.settled_private
      const newLegG = (Number(user.group_balance) || 0) + settlement.settled_group
      const live = user.cycle_key && user.cycle_expires_at && new Date(user.cycle_expires_at) >= new Date()
      const liveCycP = live ? Math.max(0, user.cycle_private || 0) : 0
      const liveCycG = live ? Math.max(0, user.cycle_group || 0) : 0
      const zeroSince = (newLegP === 0 && newLegG === 0 && liveCycP === 0 && liveCycG === 0)
        ? new Date().toISOString()
        : null
      await tx.update('users', userId, { private_balance: newLegP, group_balance: newLegG, balance_zero_since: zeroSince })
    }
    return { ok: true, settlement }
  })
}

/**
 * Credit a NEW payment into the cycle path (never onto legacy).
 * - First settles any negative legacy debt with the incoming credit
 *   (see planSettlement); the remainder — possibly 0 — enters the cycle.
 * - If no active cycle or different cycle_key → expire old cycle first (if any), start fresh.
 * - Same active cycle → accumulate within cycle.
 * Returns { ok, mode, settlement, expiredInline?, replacedInline?, after }.
 */
export async function creditCycle(userId, privateAdd = 0, groupAdd = 0) {
  const pAdd = Math.max(0, parseInt(privateAdd, 10) || 0)
  const gAdd = Math.max(0, parseInt(groupAdd, 10) || 0)
  if (pAdd === 0 && gAdd === 0) return { ok: true }

  return db.transaction(async (tx) => {
    let user = await tx.get('users', userId)
    if (!user) return { ok: false, error: 'User not found' }

    // Lazy-expire inside the same transaction if past due
    if (user.cycle_key && user.cycle_expires_at && new Date(user.cycle_expires_at) < new Date()) {
      // Inline expire (no notifications mid-tx; audit after)
      const remP = Math.max(0, user.cycle_private || 0)
      const remG = Math.max(0, user.cycle_group || 0)
      const paidP = user.cycle_private_paid || 0
      const paidG = user.cycle_group_paid || 0
      await tx.update('users', userId, {
        cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null,
        cycle_private_paid: 0, cycle_group_paid: 0,
      })
      user = { ...user, cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null, cycle_private_paid: 0, cycle_group_paid: 0 }
      // Audit outside after commit via return marker — caller path still gets audit via auditBalanceChange
      var expiredInline = { paid: { private: paidP, group: paidG }, used: { private: paidP - remP, group: paidG - remG }, expired: { private: remP, group: remG } }
    }

    // Settle negative legacy debt with this credit first (own bucket, then
    // cross-bucket at 1P = 2G). Only the remainder enters the cycle.
    const settlement = planSettlement(pAdd, gAdd, user.private_balance, user.group_balance)
    if (settlement.settled_private > 0 || settlement.settled_group > 0) {
      const newLegP = (Number(user.private_balance) || 0) + settlement.settled_private
      const newLegG = (Number(user.group_balance) || 0) + settlement.settled_group
      const live = user.cycle_key && user.cycle_expires_at && new Date(user.cycle_expires_at) >= new Date()
      const liveCycP = live ? Math.max(0, user.cycle_private || 0) : 0
      const liveCycG = live ? Math.max(0, user.cycle_group || 0) : 0
      const zeroSince = (newLegP === 0 && newLegG === 0 && liveCycP === 0 && liveCycG === 0)
        ? new Date().toISOString()
        : null
      await tx.update('users', userId, { private_balance: newLegP, group_balance: newLegG, balance_zero_since: zeroSince })
      user = { ...user, private_balance: newLegP, group_balance: newLegG, balance_zero_since: zeroSince }
    }

    const pC = settlement.credited_private
    const gC = settlement.credited_group

    if (pC === 0 && gC === 0) {
      // Entire payment went to debt settlement — leave the cycle untouched
      return {
        ok: true,
        mode: 'settled_only',
        settlement,
        expiredInline: typeof expiredInline !== 'undefined' ? expiredInline : null,
        after: {
          cycle_private: Math.max(0, user.cycle_private || 0),
          cycle_group: Math.max(0, user.cycle_group || 0),
          cycle_key: user.cycle_key || null,
          cycle_expires_at: user.cycle_expires_at || null,
        },
      }
    }

    const key = currentCycleKey()
    const sameCycle = user.cycle_key === key && user.cycle_expires_at && new Date(user.cycle_expires_at) >= new Date()

    if (sameCycle) {
      const newCycP = Math.max(0, (user.cycle_private || 0)) + pC
      const newCycG = Math.max(0, (user.cycle_group || 0)) + gC
      const newPaidP = (user.cycle_private_paid || 0) + pC
      const newPaidG = (user.cycle_group_paid || 0) + gC
      await tx.update('users', userId, {
        cycle_private: newCycP,
        cycle_group: newCycG,
        cycle_private_paid: newPaidP,
        cycle_group_paid: newPaidG,
        cycle_key: key,
        cycle_expires_at: cycleExpiryFor(key),
        balance_zero_since: null,
      })
      return {
        ok: true,
        mode: 'accumulate',
        settlement,
        expiredInline: typeof expiredInline !== 'undefined' ? expiredInline : null,
        after: { cycle_private: newCycP, cycle_group: newCycG, cycle_key: key, cycle_expires_at: cycleExpiryFor(key) },
      }
    }

    // Different/no cycle → do NOT stack onto previous remaining; start fresh bucket
    // (previous remaining was zeroed above if expired; if still-active different key, force-replace)
    if (user.cycle_key && user.cycle_key !== key) {
      const remP = Math.max(0, user.cycle_private || 0)
      const remG = Math.max(0, user.cycle_group || 0)
      const paidP = user.cycle_private_paid || 0
      const paidG = user.cycle_group_paid || 0
      await tx.update('users', userId, {
        cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null,
        cycle_private_paid: 0, cycle_group_paid: 0,
      })
      var replacedInline = { cycle_key: user.cycle_key, paid: { private: paidP, group: paidG }, used: { private: paidP - remP, group: paidG - remG }, expired: { private: remP, group: remG } }
    }

    const exp = cycleExpiryFor(key)
    await tx.update('users', userId, {
      cycle_private: pC,
      cycle_group: gC,
      cycle_private_paid: pC,
      cycle_group_paid: gC,
      cycle_key: key,
      cycle_expires_at: exp,
      balance_zero_since: null,
    })
    return {
      ok: true,
      mode: 'new_cycle',
      settlement,
      expiredInline: typeof expiredInline !== 'undefined' ? expiredInline : null,
      replacedInline: typeof replacedInline !== 'undefined' ? replacedInline : null,
      after: { cycle_private: pC, cycle_group: gC, cycle_key: key, cycle_expires_at: exp },
    }
  })
}

/**
 * Deduct one session, conversion-aware, dual-path.
 * Prefer cycle (expiring) then legacy. Never go below 0 on either bucket.
 * Returns { success, newBalance: { private_balance, group_balance, cycle_private, cycle_group } | null }
 */
export async function deductBalanceCycle(userId, sessionType, { allowNegative = false } = {}) {
  return db.transaction(async (tx) => {
    let user = await tx.get('users', userId)
    if (!user) return { success: false, newBalance: null }

    // Lazy expire inside tx
    if (user.cycle_key && user.cycle_expires_at && new Date(user.cycle_expires_at) < new Date()) {
      await tx.update('users', userId, {
        cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null,
        cycle_private_paid: 0, cycle_group_paid: 0,
      })
      user = { ...user, cycle_private: 0, cycle_group: 0, cycle_key: null, cycle_expires_at: null }
    }

    // Legacy balances are raw (may be negative = debt). Flooring here would wipe
    // existing debt on an allowNegative deduct.
    let legP = Number(user.private_balance) || 0
    let legG = Number(user.group_balance) || 0
    let cycP = Math.max(0, user.cycle_private || 0)
    let cycG = Math.max(0, user.cycle_group || 0)

    const write = async (extra = {}) => {
      const updates = { private_balance: legP, group_balance: legG, cycle_private: cycP, cycle_group: cycG, ...extra }
      if (legP === 0 && legG === 0 && cycP === 0 && cycG === 0) updates.balance_zero_since = new Date().toISOString()
      else updates.balance_zero_since = null
      await tx.update('users', userId, updates)
      return { private_balance: legP, group_balance: legG, cycle_private: cycP, cycle_group: cycG }
    }

    if (sessionType === 'private') {
      // Cycle first
      if (cycP > 0) { cycP -= 1; return { success: true, newBalance: await write() } }
      if (legP > 0) { legP -= 1; return { success: true, newBalance: await write() } }
      if (allowNegative) { legP -= 1; return { success: true, newBalance: await write() } }
      return { success: false, newBalance: null }
    }

    if (sessionType === 'group') {
      // 1) cycle group
      if (cycG > 0) { cycG -= 1; return { success: true, newBalance: await write() } }
      // 2) legacy group
      if (legG > 0) { legG -= 1; return { success: true, newBalance: await write() } }
      // 3) convert from cycle private → cycle group (consume 1 priv, net +1 group after using one)
      if (cycP > 0) { cycP -= 1; cycG += 1; return { success: true, newBalance: await write() } }
      // 4) convert from legacy private
      if (legP > 0) { legP -= 1; legG += 1; return { success: true, newBalance: await write() } }
      if (allowNegative) { legG -= 1; return { success: true, newBalance: await write() } }
      return { success: false, newBalance: null }
    }

    return { success: false, newBalance: null }
  })
}

/**
 * Reverse a prior deduction (cancel/delete path). Dual-path, floor at 0.
 * Prefer returning to the bucket that still has "room" — cycle if active, else legacy.
 */
export async function reverseBalanceCycle(userId, sessionType) {
  return db.transaction(async (tx) => {
    const user = await tx.get('users', userId)
    if (!user) return false
    // Raw legacy: a refund on an indebted player must first repay the debt
    // (flooring at 0 here would over-credit by the debt amount).
    let legP = Number(user.private_balance) || 0
    let legG = Number(user.group_balance) || 0
    let cycP = Math.max(0, user.cycle_private || 0)
    let cycG = Math.max(0, user.cycle_group || 0)
    const cycleLive = user.cycle_key && user.cycle_expires_at && new Date(user.cycle_expires_at) >= new Date()

    if (sessionType === 'private') {
      if (cycleLive) cycP += 1
      else legP += 1
    } else if (sessionType === 'group') {
      if (cycleLive) cycG += 1
      else legG += 1
    }

    await tx.update('users', userId, {
      private_balance: legP, group_balance: legG,
      cycle_private: cycP, cycle_group: cycG,
      balance_zero_since: null,
    })
    return true
  })
}
