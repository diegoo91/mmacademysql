import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

router.get('/summary', (req, res) => {
  try {
    const { from, to, preset } = req.query
    let rangeFrom = from || null
    let rangeTo = to || null
    const now = new Date()
    if (preset === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - 7); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      const d = new Date(now); d.setMonth(now.getMonth() - 1); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    }

    const allBookings = db.findAll('bookings')
    let paidBookings = allBookings.filter(b => b.status === 'player_confirmed' || b.status === 'payment_approved' || b.status === 'schedule_approved')
    if (rangeFrom) paidBookings = paidBookings.filter(b => {
      const paidDate = b.paidAt || b.updated_at || b.created_at
      return paidDate && paidDate.slice(0, 10) >= rangeFrom
    })
    if (rangeTo) paidBookings = paidBookings.filter(b => {
      const paidDate = b.paidAt || b.updated_at || b.created_at
      return paidDate && paidDate.slice(0, 10) <= rangeTo
    })

    const payments = paidBookings.map(b => {
      const playerName = b.player_name || (b.user_id ? (db.get('users', b.user_id)?.name || 'Unknown') : 'Unknown')
      return {
        id: b.id, ref: b.ref, date: (b.paidAt || b.updated_at || b.created_at)?.slice(0, 10),
        player: playerName, amount: Number(b.amountPaid) || Number(b.total) || 0,
        session_type: b.session_type, status: b.status, paid: !!b.paid,
      }
    })

    let standalonePayments = db.findAll('payments')
    if (rangeFrom) standalonePayments = standalonePayments.filter(p => p.date >= rangeFrom)
    if (rangeTo) standalonePayments = standalonePayments.filter(p => p.date <= rangeTo)
    const mappedStandalone = standalonePayments.map(p => ({
      id: 'pay-' + p.id, ref: p.ref, date: p.date,
      player: p.player_name, amount: Number(p.amount) || 0,
      session_type: p.method, status: 'paid', paid: true,
    }))
    const allPayments = [...payments, ...mappedStandalone]

    let allSlots = db.findAll('slots')
    if (rangeFrom) allSlots = allSlots.filter(s => s.date >= rangeFrom)
    if (rangeTo) allSlots = allSlots.filter(s => s.date <= rangeTo)

    const scheduleHistory = allSlots.map(s => ({
      date: s.date, time: s.time, court: s.court, player_text: s.player_text || 'Available', booking_id: s.booking_id,
    }))

    const sessionCounts = {}
    for (const s of allSlots) {
      if (!s.player_text || s.player_text === 'Available') continue
      const names = s.player_text.split(/[/+]/).map(n => n.trim()).filter(Boolean)
      for (const name of names) {
        sessionCounts[name] = (sessionCounts[name] || 0) + 1
      }
    }
    const sessionsPerPlayer = Object.entries(sessionCounts)
      .map(([name, count]) => ({ name, sessions: count }))
      .sort((a, b) => b.sessions - a.sessions)

    let allResults = db.findAll('results')
    if (rangeFrom) allResults = allResults.filter(r => r.date >= rangeFrom)
    if (rangeTo) allResults = allResults.filter(r => r.date <= rangeTo)

    const confirmedResults = allResults.filter(r => r.status === 'confirmed')
    const playerStats = {}
    for (const r of confirmedResults) {
      const allPlayers = [...(r.sideA || [r.player_a]), ...(r.sideB || [r.player_b])]

      for (const p of allPlayers) {
        if (!playerStats[p]) playerStats[p] = { name: p, played: 0, wins: 0, losses: 0, partners: {}, opponents: {} }
        playerStats[p].played++

        const isSideA = (r.sideA || []).includes(p) || r.player_a === p
        const mySide = isSideA ? 'A' : 'B'
        const won = r.winner_side === mySide
        if (won) playerStats[p].wins++
        else playerStats[p].losses++

        const mySidePlayers = isSideA ? (r.sideA || []) : (r.sideB || [])
        for (const mate of mySidePlayers) {
          if (mate !== p) {
            playerStats[p].partners[mate] = (playerStats[p].partners[mate] || 0) + 1
          }
        }

        const otherSide = isSideA ? (r.sideB || []) : (r.sideA || [])
        for (const opp of otherSide) {
          playerStats[p].opponents[opp] = (playerStats[p].opponents[opp] || 0) + 1
        }
      }
    }

    const matchResults = Object.values(playerStats).map(p => ({
      ...p,
      partners: Object.entries(p.partners).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      opponents: Object.entries(p.opponents).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    })).sort((a, b) => b.played - a.played)

    let expenses = db.findAll('expenses')
    if (rangeFrom) expenses = expenses.filter(e => e.date >= rangeFrom)
    if (rangeTo) expenses = expenses.filter(e => e.date <= rangeTo)

    const totalRevenue = allPayments.reduce((s, p) => s + p.amount, 0)
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

    res.json({
      payments: allPayments, scheduleHistory, sessionsPerPlayer, matchResults,
      profit: { revenue: totalRevenue, expenses: totalExpenses, net: totalRevenue - totalExpenses },
      range: { from: rangeFrom, to: rangeTo, preset: preset || 'custom' },
    })
  } catch (err) {
    console.error('Reports summary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /coach-hours — superadmin only, total hours worked per coach over date range
router.get('/coach-hours', requireRole('superadmin'), (req, res) => {
  try {
    const { from, to, preset } = req.query
    let rangeFrom = from || null
    let rangeTo = to || null
    const now = new Date()
    if (preset === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - 7); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      const d = new Date(now); d.setMonth(now.getMonth() - 1); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    }

    let allSlots = db.findAll('slots')
    if (rangeFrom) allSlots = allSlots.filter(s => s.date >= rangeFrom)
    if (rangeTo) allSlots = allSlots.filter(s => s.date <= rangeTo)

    const coaches = db.findAll('users', u => u.role === 'coach')
    const coachMap = new Map(coaches.map(c => [c.id, c.name]))

    const hoursMap = {}
    for (const s of allSlots) {
      if (!s.coach_id) continue
      const name = coachMap.get(s.coach_id) || `Coach #${s.coach_id}`
      hoursMap[name] = (hoursMap[name] || 0) + 1
    }

    const coachHours = Object.entries(hoursMap)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours)

    res.json({ coachHours, range: { from: rangeFrom, to: rangeTo, preset: preset || 'custom' } })
  } catch (err) {
    console.error('Coach hours report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
