import db from '../db.js'
import { packagePrice } from './pricing.js'
import { simulateFifo } from './convertBalance.js'

/**
 * Shared paid-FIFO engine — single source of truth for per-slot paid status.
 * Extracted from players.js to be reusable by player reports, unpaid reports, etc.
 *
 * Returns { sessions: [...], amountOwed, unpaidPrivate, unpaidGroup }
 * Each session: { date, time, court, session_type, paid, paid_via, booking_ref, status }
 *
 * opts.excludePaymentId — ignore one payment row (used when re-deriving a
 * payment's own coverage while editing it: its credit must not pay for itself).
 */
export async function computePlayerSessions(player, { excludePaymentId = null } = {}) {
  const playerName = (player.name || '').toLowerCase()

  const allSlots = await db.findAll('slots')
  const playerSlots = allSlots
    .filter(s => {
      if (!s.player_text) return false
      const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
      return names.includes(playerName)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const payments = (await db.findAll('payments'))
    .filter(p => p.player_id === player.id && p.status === 'payment_approved')
    .filter(p => p.id !== excludePaymentId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let poolPriv = 0, poolGrp = 0
  for (const p of payments) {
    poolPriv += p.private_sessions || 0
    poolGrp += p.group_sessions || 0
  }

  const entries = []
  for (const s of playerSlots) {
    const booking = s.booking_id ? await db.get('bookings', s.booking_id) : null
    const directPayment = booking
      ? await db.find('payments', p => p.booking_id === booking.id && p.status === 'payment_approved' && p.id !== excludePaymentId)
      : null
    const sessionType = s.session_type || (booking ? booking.session_type : null) || 'private'
    // Slot-level payment already approved (slot carries the payment, e.g. a
    // player swap left no booking link) — attended or not, it is paid.
    const externallyPaid = !!(directPayment || booking?.paid || s.status === 'payment_approved')
    entries.push({ slot: s, booking, sessionType, externallyPaid })
  }

  const walk = simulateFifo(
    poolPriv,
    poolGrp,
    entries.map(e => ({ session_type: e.sessionType, _external: e.externallyPaid })),
    { isExternallyPaid: (s) => s._external },
  )

  const sessions = entries.map((e, i) => ({
    date: e.slot.date, time: e.slot.time, court: e.slot.court,
    session_type: e.sessionType,
    paid: walk.results[i].paid, paid_via: walk.results[i].paid_via,
    booking_ref: e.booking ? e.booking.ref : null, status: e.slot.status,
  }))

  sessions.reverse()

  const unpaidPrivate = sessions.filter(s => !s.paid && s.session_type !== 'group').length
  const unpaidGroup = sessions.filter(s => !s.paid && s.session_type === 'group').length
  // Package priced: 16 private = 14,000 + 3 group = 1,500 → 15,500 (not 17,500).
  const amountOwed = packagePrice(unpaidPrivate, unpaidGroup)

  return { sessions, amountOwed, unpaidPrivate, unpaidGroup }
}

/**
 * Compute unpaid players report — all players with unpaid sessions OR an
 * outstanding cash shortfall (package value beyond what they paid; a player
 * can owe cash with zero unpaid sessions, e.g. after a round-up pack edit).
 * amount_owed is the TOTAL owed (session package price + cash shortfall);
 * sessions_owed and cash_owed are its components.
 * Returns [{ id, name, unpaid_sessions, unpaid_private, unpaid_group,
 *            amount_owed, sessions_owed, cash_owed, sessions: [...] }]
 */
export async function computeUnpaidPlayers() {
  const players = await db.findAll('users', u => u.role === 'player')
  const results = []

  for (const player of players) {
    const { sessions, amountOwed, unpaidPrivate, unpaidGroup } = await computePlayerSessions(player)
    const cashBalance = Number(player.cash_balance) || 0
    const cashOwed = cashBalance < 0 ? -cashBalance : 0
    if (unpaidPrivate + unpaidGroup === 0 && cashOwed <= 0) continue

    results.push({
      id: player.id,
      name: player.name,
      email: player.email,
      phone: player.phone,
      unpaid_sessions: unpaidPrivate + unpaidGroup,
      unpaid_private: unpaidPrivate,
      unpaid_group: unpaidGroup,
      amount_owed: amountOwed + cashOwed,
      sessions_owed: amountOwed,
      cash_owed: cashOwed,
      sessions: sessions.filter(s => !s.paid),
    })
  }

  results.sort((a, b) => b.amount_owed - a.amount_owed)
  return results
}
