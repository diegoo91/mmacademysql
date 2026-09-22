import db from '../db.js'

/**
 * Shared paid-FIFO engine — single source of truth for per-slot paid status.
 * Extracted from players.js to be reusable by player reports, unpaid reports, etc.
 *
 * Returns { sessions: [...], amountOwed: number }
 * Each session: { date, time, court, session_type, paid, paid_via, booking_ref, status }
 */
export async function computePlayerSessions(player) {
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
      ? await db.find('payments', p => p.booking_id === booking.id && p.status === 'payment_approved')
      : null
    const sessionType = s.session_type || (booking ? booking.session_type : null) || 'private'

    let paid = false
    let paidVia = null
    if (directPayment || booking?.paid) {
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

  const amountOwed = sessions
    .filter(s => !s.paid)
    .reduce((sum, s) => sum + (s.session_type === 'private' ? 1000 : 500), 0)

  return { sessions, amountOwed }
}

/**
 * Compute unpaid players report — all players with unpaid sessions.
 * Returns [{ id, name, unpaid_sessions, unpaid_private, unpaid_group, amount_owed, sessions: [...] }]
 */
export async function computeUnpaidPlayers() {
  const players = await db.findAll('users', u => u.role === 'player')
  const results = []

  for (const player of players) {
    const { sessions, amountOwed } = await computePlayerSessions(player)
    const unpaid = sessions.filter(s => !s.paid)
    if (unpaid.length === 0) continue

    const unpaidPrivate = unpaid.filter(s => s.session_type === 'private').length
    const unpaidGroup = unpaid.filter(s => s.session_type === 'group').length

    results.push({
      id: player.id,
      name: player.name,
      email: player.email,
      phone: player.phone,
      unpaid_sessions: unpaid.length,
      unpaid_private: unpaidPrivate,
      unpaid_group: unpaidGroup,
      amount_owed: amountOwed,
      sessions: unpaid,
    })
  }

  results.sort((a, b) => b.amount_owed - a.amount_owed)
  return results
}
