import db from '../db.js'
import { packagePrice } from './pricing.js'

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

  const sessions = []
  for (const s of playerSlots) {
    const booking = s.booking_id ? await db.get('bookings', s.booking_id) : null
    const directPayment = booking
      ? await db.find('payments', p => p.booking_id === booking.id && p.status === 'payment_approved' && p.id !== excludePaymentId)
      : null
    const sessionType = s.session_type || (booking ? booking.session_type : null) || 'private'

    let paid = false
    let paidVia = null
    if (directPayment || booking?.paid) {
      paid = true
      paidVia = 'payment'
    } else if (s.status === 'payment_approved') {
      // Slot-level payment already approved (slot carries the payment, e.g. a
      // player swap left no booking link) — attended or not, it is paid.
      paid = true
      paidVia = 'payment'
    } else {
      if (sessionType === 'private') {
        if (poolPriv > 0) { poolPriv--; paid = true; paidVia = 'payment' }
        else if (poolGrp >= 2) { poolGrp -= 2; paid = true; paidVia = 'converted' }
      } else {
        if (poolGrp > 0) { poolGrp--; paid = true; paidVia = 'payment' }
        else if (poolPriv > 0) { poolPriv--; poolGrp += 1; paid = true; paidVia = 'converted' }
      }
    }

    sessions.push({
      date: s.date, time: s.time, court: s.court,
      session_type: sessionType, paid, paid_via: paidVia,
      booking_ref: booking ? booking.ref : null, status: s.status,
    })
  }

  sessions.reverse()

  const unpaidPrivate = sessions.filter(s => !s.paid && s.session_type !== 'group').length
  const unpaidGroup = sessions.filter(s => !s.paid && s.session_type === 'group').length
  // Package priced: 16 private = 14,000 + 3 group = 1,500 → 15,500 (not 17,500).
  const amountOwed = packagePrice(unpaidPrivate, unpaidGroup)

  return { sessions, amountOwed, unpaidPrivate, unpaidGroup }
}

/**
 * Compute unpaid players report — all players with unpaid sessions.
 * Returns [{ id, name, unpaid_sessions, unpaid_private, unpaid_group, amount_owed, sessions: [...] }]
 */
export async function computeUnpaidPlayers() {
  const players = await db.findAll('users', u => u.role === 'player')
  const results = []

  for (const player of players) {
    const { sessions, amountOwed, unpaidPrivate, unpaidGroup } = await computePlayerSessions(player)
    if (unpaidPrivate + unpaidGroup === 0) continue

    results.push({
      id: player.id,
      name: player.name,
      email: player.email,
      phone: player.phone,
      unpaid_sessions: unpaidPrivate + unpaidGroup,
      unpaid_private: unpaidPrivate,
      unpaid_group: unpaidGroup,
      amount_owed: amountOwed,
      sessions: sessions.filter(s => !s.paid),
    })
  }

  results.sort((a, b) => b.amount_owed - a.amount_owed)
  return results
}
