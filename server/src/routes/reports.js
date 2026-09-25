import { Router } from 'express'
import ExcelJS from 'exceljs'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { computeUnpaidPlayers } from '../utils/sessionPaid.js'

const router = Router()
router.use(authenticate)

router.get('/summary', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { from, to, preset } = req.query
    let rangeFrom = from || null
    let rangeTo = to || null
    const now = new Date()
    if (preset === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - 7); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      rangeFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      rangeTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else if (preset === 'all') {
      rangeFrom = null
      rangeTo = null
    }

    const allBookings = await db.findAll('bookings')
    let paidBookings = allBookings.filter(b => b.status === 'player_confirmed' || b.status === 'payment_approved' || b.status === 'schedule_approved')
    if (rangeFrom) paidBookings = paidBookings.filter(b => {
      const paidDate = b.paidAt || b.updated_at || b.created_at
      return paidDate && paidDate.slice(0, 10) >= rangeFrom
    })
    if (rangeTo) paidBookings = paidBookings.filter(b => {
      const paidDate = b.paidAt || b.updated_at || b.created_at
      return paidDate && paidDate.slice(0, 10) <= rangeTo
    })

    const payments = await Promise.all(paidBookings.map(async (b) => {
      const playerName = b.player_name || (b.user_id ? ((await db.get('users', b.user_id))?.name || 'Unknown') : 'Unknown')
      return {
        id: b.id, ref: b.ref, date: (b.paidAt || b.updated_at || b.created_at)?.slice(0, 10),
        player: playerName, amount: Number(b.amountPaid) || Number(b.total) || 0,
        session_type: b.session_type, status: b.status, paid: !!b.paid,
      }
    }))

    let standalonePayments = await db.findAll('payments')
    if (rangeFrom) standalonePayments = standalonePayments.filter(p => p.date >= rangeFrom)
    if (rangeTo) standalonePayments = standalonePayments.filter(p => p.date <= rangeTo)
    const mappedStandalone = standalonePayments.map(p => {
      const approved = p.status === 'payment_approved'
      return {
        id: 'pay-' + p.id, ref: p.ref, date: p.date,
        player: p.player_name, amount: Number(p.amount) || 0,
        session_type: p.method, status: approved ? 'paid' : (p.status || 'pending'), paid: approved,
      }
    })
    const allPayments = [...payments, ...mappedStandalone]

    let allSlots = await db.findAll('slots')
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

    let allResults = await db.findAll('results')
    if (rangeFrom) allResults = allResults.filter(r => r.date >= rangeFrom)
    if (rangeTo) allResults = allResults.filter(r => r.date <= rangeTo)

    const confirmedResults = allResults.filter(r => r.status === 'confirmed')

    const allUsers = await db.findAll('users')
    const userIdByName = new Map()
    for (const u of allUsers) {
      if (u.name) userIdByName.set(u.name.toLowerCase(), u.id)
    }
    const userNameById = new Map(allUsers.map(u => [u.id, u.name]))

    const playerStats = {}
    const keyFor = (name, id) => {
      if (id) return `id:${id}`
      return `name:${(name || '').toLowerCase()}`
    }
    const displayName = (key) => {
      if (key.startsWith('id:')) return userNameById.get(parseInt(key.slice(3))) || `User #${key.slice(3)}`
      return key.slice(6)
    }

    for (const r of confirmedResults) {
      const sideA = Array.isArray(r.sideA) ? r.sideA : [r.player_a].filter(Boolean)
      const sideB = Array.isArray(r.sideB) ? r.sideB : [r.player_b].filter(Boolean)
      const idsA = Array.isArray(r.sideA_ids) ? r.sideA_ids : []
      const idsB = Array.isArray(r.sideB_ids) ? r.sideB_ids : []

      const sideAKeys = sideA.map((name, i) => keyFor(name, idsA[i] || userIdByName.get(name?.toLowerCase())))
      const sideBKeys = sideB.map((name, i) => keyFor(name, idsB[i] || userIdByName.get(name?.toLowerCase())))
      const allKeys = [...sideAKeys, ...sideBKeys]

      for (const k of allKeys) {
        if (!playerStats[k]) playerStats[k] = { key: k, name: displayName(k), played: 0, wins: 0, losses: 0, partners: {}, opponents: {} }
        playerStats[k].played++

        const isSideA = sideAKeys.includes(k)
        const mySide = isSideA ? 'A' : 'B'
        const won = r.winner_side === mySide
        if (won) playerStats[k].wins++
        else playerStats[k].losses++

        for (const mate of sideAKeys) {
          if (mate !== k) {
            const mateName = displayName(mate)
            playerStats[k].partners[mateName] = (playerStats[k].partners[mateName] || 0) + 1
          }
        }

        for (const opp of sideBKeys) {
          if (opp !== k) {
            const oppName = displayName(opp)
            playerStats[k].opponents[oppName] = (playerStats[k].opponents[oppName] || 0) + 1
          }
        }
      }
    }

    const matchResults = Object.values(playerStats).map(p => ({
      name: p.name,
      played: p.played, wins: p.wins, losses: p.losses,
      partners: Object.entries(p.partners).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      opponents: Object.entries(p.opponents).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    })).sort((a, b) => b.played - a.played)

    let expenses = await db.findAll('expenses')
    if (rangeFrom) expenses = expenses.filter(e => e.date >= rangeFrom)
    if (rangeTo) expenses = expenses.filter(e => e.date <= rangeTo)

    const totalRevenue = payments.reduce((s, p) => s + p.amount, 0)
      + standalonePayments.filter(p => p.status === 'payment_approved').reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

    let newPlayers = 0
    for (const u of allUsers) {
      if (u.role !== 'player') continue
      const created = (u.created_at || '').slice(0, 10)
      if (!created) continue
      if (rangeFrom && created < rangeFrom) continue
      if (rangeTo && created > rangeTo) continue
      newPlayers++
    }

    const sessionsPlayed = allSlots.filter(s => s.player_text && s.player_text !== 'Available').length
    const unpaid = await computeUnpaidPlayers()
    const unpaidTotal = unpaid.reduce((s, p) => s + (Number(p.amount_owed) || 0), 0)
    const coachHoursTotal = (await db.findAll('coach_daily_hours'))
      .filter(h => (!rangeFrom || h.date >= rangeFrom) && (!rangeTo || h.date <= rangeTo))
      .reduce((s, h) => s + (Number(h.hours) || 0), 0)

    res.json({
      payments: allPayments, scheduleHistory, sessionsPerPlayer, matchResults,
      profit: { revenue: totalRevenue, expenses: totalExpenses, net: totalRevenue - totalExpenses },
      summary: {
        payments_received: totalRevenue,
        expenses: totalExpenses,
        sessions_played: sessionsPlayed,
        new_players: newPlayers,
        unpaid_amounts: unpaidTotal,
        coach_hours: coachHoursTotal,
      },
      range: { from: rangeFrom, to: rangeTo, preset: preset || 'custom' },
    })
  } catch (err) {
    console.error('Reports summary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /coach-hours — admin only, total hours worked per coach over date range + balance
router.get('/coach-hours', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { from, to, preset } = req.query
    let rangeFrom = from || null
    let rangeTo = to || null
    const now = new Date()
    if (preset === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - 7); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
    } else if (preset === 'month') {
      rangeFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      rangeTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else if (preset === 'all') {
      rangeFrom = null
      rangeTo = null
    }

    let allHours = await db.findAll('coach_daily_hours')
    if (rangeFrom) allHours = allHours.filter(h => h.date >= rangeFrom)
    if (rangeTo) allHours = allHours.filter(h => h.date <= rangeTo)

    const coaches = await db.findAll('users', u => u.role === 'coach')
    const coachMap = new Map(coaches.map(c => [c.id, c.name]))

    const dailyByCoach = {}
    for (const h of allHours) {
      const name = coachMap.get(h.coach_id) || `Coach #${h.coach_id}`
      if (!dailyByCoach[name]) dailyByCoach[name] = { coach_id: h.coach_id, days: [] }
      dailyByCoach[name].days.push({ date: h.date, hours: Number(h.hours), notes: h.notes })
    }

    const coachHours = Object.entries(dailyByCoach)
      .map(([name, data]) => ({
        name,
        coach_id: data.coach_id,
        hours: data.days.reduce((s, d) => s + d.hours, 0),
        days: data.days.sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => b.hours - a.hours)

    res.json({ coachHours, range: { from: rangeFrom, to: rangeTo, preset: preset || 'custom' } })
  } catch (err) {
    console.error('Coach hours report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /coach-balance — admin: all coaches' running balances (total earned - total paid)
router.get('/coach-balance', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const coaches = await db.findAll('users', u => u.role === 'coach')
    const allHours = await db.findAll('coach_daily_hours')
    const allPayments = await db.findAll('coach_payments')

    const balances = coaches.map(c => {
      const earned = allHours.filter(h => h.coach_id === c.id).reduce((s, h) => s + Number(h.hours), 0)
      const paid = allPayments.filter(p => p.coach_id === c.id).reduce((s, p) => s + Number(p.hours_deducted), 0)
      return {
        coach_id: c.id,
        name: c.name,
        total_earned: earned,
        total_paid: paid,
        balance: earned - paid,
      }
    }).sort((a, b) => b.balance - a.balance)

    res.json({ balances })
  } catch (err) {
    console.error('Coach balance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /coach-balance/my — coach: their own running balance
router.get('/coach-balance/my', async (req, res) => {
  try {
    const user = req.user
    if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Coach access only' })
    const coachId = user.id

    const myHours = await db.findAll('coach_daily_hours', h => h.coach_id === coachId)
    const myPayments = await db.findAll('coach_payments', p => p.coach_id === coachId)

    const earned = myHours.reduce((s, h) => s + Number(h.hours), 0)
    const paid = myPayments.reduce((s, p) => s + Number(p.hours_deducted), 0)

    res.json({ total_earned: earned, total_paid: paid, balance: earned - paid })
  } catch (err) {
    console.error('My coach balance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /coach-hours/my — coach only, their own daily hours
router.get('/coach-hours/my', async (req, res) => {
  try {
    const user = req.user
    if (!user || user.role !== 'coach') return res.status(403).json({ error: 'Coach access only' })

    const coachId = user.id
    let allHours = await db.findAll('coach_daily_hours', h => h.coach_id === coachId)
    const { from, to } = req.query
    if (from) allHours = allHours.filter(h => h.date >= from)
    if (to) allHours = allHours.filter(h => h.date <= to)

    allHours.sort((a, b) => a.date.localeCompare(b.date))

    const totalHours = allHours.reduce((s, h) => s + Number(h.hours), 0)

    res.json({ hours: allHours.map(h => ({ date: h.date, hours: Number(h.hours), notes: h.notes })), total: totalHours })
  } catch (err) {
    console.error('My coach hours error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /admin/coach-hours — admin: upsert a daily hour record
router.put('/coach-hours', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { coach_id, date, hours, notes } = req.body
    if (!coach_id || !date || hours === undefined) {
      return res.status(400).json({ error: 'coach_id, date, and hours are required' })
    }

    const existing = await db.find('coach_daily_hours', h => h.coach_id === coach_id && h.date === date)
    if (existing) {
      await db.update('coach_daily_hours', existing.id, { hours, notes: notes || existing.notes, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) })
    } else {
      await db.insert('coach_daily_hours', { coach_id, date, hours, notes: notes || '', source: 'admin', created_by: req.user?.id || req.user?.user_id })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Update coach hours error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /admin/coach-hours/:id — admin: remove a daily hour record
router.delete('/coach-hours/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const removed = await db.remove('coach_daily_hours', req.params.id)
    res.json({ ok: removed })
  } catch (err) {
    console.error('Delete coach hours error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /admin/coach-payments — admin: record a payment (hours paid out to coach)
router.post('/coach-payments', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { coach_id, date, hours_deducted, amount, notes } = req.body
    if (!coach_id || !date || !hours_deducted) {
      return res.status(400).json({ error: 'coach_id, date, and hours_deducted are required' })
    }
    const rec = await db.insert('coach_payments', {
      coach_id, date, hours_deducted, amount: amount || 0, notes: notes || '',
      created_by: req.user?.id || req.user?.user_id,
    })
    res.json({ ok: true, payment: rec })
  } catch (err) {
    console.error('Create coach payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /admin/coach-payments — admin: list all coach payments
router.get('/coach-payments', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { coach_id } = req.query
    let payments = await db.findAll('coach_payments')
    if (coach_id) payments = payments.filter(p => p.coach_id === Number(coach_id))
    payments.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    res.json({ payments })
  } catch (err) {
    console.error('List coach payments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /admin/coach-payments/:id — admin: remove a coach payment record
router.delete('/coach-payments/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const removed = await db.remove('coach_payments', req.params.id)
    res.json({ ok: removed })
  } catch (err) {
    console.error('Delete coach payments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /reports/unpaid — admin: all players with unpaid sessions
router.get('/unpaid', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const unpaid = await computeUnpaidPlayers()
    res.json({ unpaid_players: unpaid, total_owed: unpaid.reduce((s, p) => s + p.amount_owed, 0) })
  } catch (err) {
    console.error('Unpaid players report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /reports/remaining-sessions — admin: paid players with remaining session balances
router.get('/remaining-sessions', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { ensureCycleFresh, effectivePrivate, effectiveGroupBalance, monthlyDisplay } = await import('../utils/balance.js')
    const players = await db.findAll('users', u => u.role === 'player')
    const withBalance = []
    for (const p of players) {
      const fresh = await ensureCycleFresh(p, { notify: true })
      const u = fresh || p
      const priv = effectivePrivate(u)
      const grpFromPriv = priv * 2
      const grp = Math.max(0, effectiveGroupBalance(u) - grpFromPriv)
      if (priv <= 0 && grp <= 0) continue
      const monthly = monthlyDisplay(u)
      withBalance.push({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        private_balance: priv,
        group_balance: grp,
        group_from_private: grpFromPriv,
        cycle_private: monthly.private,
        cycle_group: monthly.group,
        cycle_expires_at: monthly.expires_at,
        legacy_private: monthly.legacy_private,
        legacy_group: monthly.legacy_group,
        remaining_sessions: priv + grp,
      })
    }
    withBalance.sort((a, b) => b.remaining_sessions - a.remaining_sessions)

    res.json({
      players: withBalance,
      total_remaining: withBalance.reduce((s, p) => s + p.remaining_sessions, 0),
      total_private: withBalance.reduce((s, p) => s + p.private_balance, 0),
      total_group: withBalance.reduce((s, p) => s + p.group_balance, 0),
    })
  } catch (err) {
    console.error('Remaining sessions report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function resolveRange(from, to, preset) {
  let rangeFrom = from || null
  let rangeTo = to || null
  const now = new Date()
  if (preset === 'week') {
    const d = new Date(now); d.setDate(now.getDate() - 7); rangeFrom = d.toISOString().slice(0, 10); rangeTo = now.toISOString().slice(0, 10)
  } else if (preset === 'month') {
    rangeFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    rangeTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  } else if (preset === 'all') {
    rangeFrom = null
    rangeTo = null
  }
  return { rangeFrom, rangeTo }
}

async function buildSummaryPayload(rangeFrom, rangeTo, preset) {
  const allBookings = await db.findAll('bookings')
  let paidBookings = allBookings.filter(b => b.status === 'player_confirmed' || b.status === 'payment_approved' || b.status === 'schedule_approved')
  if (rangeFrom) paidBookings = paidBookings.filter(b => {
    const paidDate = b.paidAt || b.updated_at || b.created_at
    return paidDate && paidDate.slice(0, 10) >= rangeFrom
  })
  if (rangeTo) paidBookings = paidBookings.filter(b => {
    const paidDate = b.paidAt || b.updated_at || b.created_at
    return paidDate && paidDate.slice(0, 10) <= rangeTo
  })

  const payments = await Promise.all(paidBookings.map(async (b) => {
    const playerName = b.player_name || (b.user_id ? ((await db.get('users', b.user_id))?.name || 'Unknown') : 'Unknown')
    return {
      id: b.id, ref: b.ref, date: (b.paidAt || b.updated_at || b.created_at)?.slice(0, 10),
      player: playerName, amount: Number(b.amountPaid) || Number(b.total) || 0,
      session_type: b.session_type, status: b.status, paid: !!b.paid,
    }
  }))

  let standalonePayments = await db.findAll('payments')
  if (rangeFrom) standalonePayments = standalonePayments.filter(p => p.date >= rangeFrom)
  if (rangeTo) standalonePayments = standalonePayments.filter(p => p.date <= rangeTo)
  const mappedStandalone = standalonePayments.map(p => {
    const approved = p.status === 'payment_approved'
    return {
      id: 'pay-' + p.id, ref: p.ref, date: p.date,
      player: p.player_name, amount: Number(p.amount) || 0,
      session_type: p.method, status: approved ? 'paid' : (p.status || 'pending'), paid: approved,
    }
  })
  const allPayments = [...payments, ...mappedStandalone]

  let allSlots = await db.findAll('slots')
  if (rangeFrom) allSlots = allSlots.filter(s => s.date >= rangeFrom)
  if (rangeTo) allSlots = allSlots.filter(s => s.date <= rangeTo)

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

  let allResults = await db.findAll('results')
  if (rangeFrom) allResults = allResults.filter(r => r.date >= rangeFrom)
  if (rangeTo) allResults = allResults.filter(r => r.date <= rangeTo)
  const confirmedResults = allResults.filter(r => r.status === 'confirmed')

  const allUsers = await db.findAll('users')
  const userIdByName = new Map()
  for (const u of allUsers) {
    if (u.name) userIdByName.set(u.name.toLowerCase(), u.id)
  }
  const userNameById = new Map(allUsers.map(u => [u.id, u.name]))

  const playerStats = {}
  const keyFor = (name, id) => {
    if (id) return `id:${id}`
    return `name:${(name || '').toLowerCase()}`
  }
  const displayName = (key) => {
    if (key.startsWith('id:')) return userNameById.get(parseInt(key.slice(3))) || `User #${key.slice(3)}`
    return key.slice(6)
  }

  for (const r of confirmedResults) {
    const sideA = Array.isArray(r.sideA) ? r.sideA : [r.player_a].filter(Boolean)
    const sideB = Array.isArray(r.sideB) ? r.sideB : [r.player_b].filter(Boolean)
    const idsA = Array.isArray(r.sideA_ids) ? r.sideA_ids : []
    const idsB = Array.isArray(r.sideB_ids) ? r.sideB_ids : []
    const sideAKeys = sideA.map((name, i) => keyFor(name, idsA[i] || userIdByName.get(name?.toLowerCase())))
    const sideBKeys = sideB.map((name, i) => keyFor(name, idsB[i] || userIdByName.get(name?.toLowerCase())))
    const allKeys = [...sideAKeys, ...sideBKeys]

    for (const k of allKeys) {
      if (!playerStats[k]) playerStats[k] = { key: k, name: displayName(k), played: 0, wins: 0, losses: 0, partners: {}, opponents: {} }
      playerStats[k].played++
      const isSideA = sideAKeys.includes(k)
      const mySide = isSideA ? 'A' : 'B'
      if (r.winner_side === mySide) playerStats[k].wins++
      else playerStats[k].losses++
      for (const mate of sideAKeys) {
        if (mate !== k) {
          const mateName = displayName(mate)
          playerStats[k].partners[mateName] = (playerStats[k].partners[mateName] || 0) + 1
        }
      }
      for (const opp of sideBKeys) {
        if (opp !== k) {
          const oppName = displayName(opp)
          playerStats[k].opponents[oppName] = (playerStats[k].opponents[oppName] || 0) + 1
        }
      }
    }
  }

  const matchResults = Object.values(playerStats).map(p => ({
    name: p.name,
    played: p.played, wins: p.wins, losses: p.losses,
    partners: Object.entries(p.partners).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    opponents: Object.entries(p.opponents).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.played - a.played)

  let expenses = await db.findAll('expenses')
  if (rangeFrom) expenses = expenses.filter(e => e.date >= rangeFrom)
  if (rangeTo) expenses = expenses.filter(e => e.date <= rangeTo)

  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0)
    + standalonePayments.filter(p => p.status === 'payment_approved').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  let newPlayers = 0
  for (const u of allUsers) {
    if (u.role !== 'player') continue
    const created = (u.created_at || '').slice(0, 10)
    if (!created) continue
    if (rangeFrom && created < rangeFrom) continue
    if (rangeTo && created > rangeTo) continue
    newPlayers++
  }

  const sessionsPlayed = allSlots.filter(s => s.player_text && s.player_text !== 'Available').length
  const unpaid = await computeUnpaidPlayers()
  const unpaidTotal = unpaid.reduce((s, p) => s + (Number(p.amount_owed) || 0), 0)
  const coachHoursTotal = (await db.findAll('coach_daily_hours'))
    .filter(h => (!rangeFrom || h.date >= rangeFrom) && (!rangeTo || h.date <= rangeTo))
    .reduce((s, h) => s + (Number(h.hours) || 0), 0)

  return {
    payments: allPayments, sessionsPerPlayer, matchResults, unpaid,
    profit: { revenue: totalRevenue, expenses: totalExpenses, net: totalRevenue - totalExpenses },
    summary: {
      payments_received: totalRevenue,
      expenses: totalExpenses,
      sessions_played: sessionsPlayed,
      new_players: newPlayers,
      unpaid_amounts: unpaidTotal,
      coach_hours: coachHoursTotal,
    },
    range: { from: rangeFrom, to: rangeTo, preset: preset || 'custom' },
  }
}

async function buildRemainingSessions() {
  const { effectivePrivate, effectiveGroupBalance, ensureCycleFresh, monthlyDisplay } = await import('../utils/balance.js')
  const players = await db.findAll('users', u => u.role === 'player')
  const out = []
  for (const p of players) {
    const fresh = await ensureCycleFresh(p, { notify: false })
    const u = fresh || p
    const priv = effectivePrivate(u)
    const grpFromPriv = priv * 2
    const grp = Math.max(0, effectiveGroupBalance(u) - grpFromPriv)
    if (priv <= 0 && grp <= 0) continue
    const monthly = monthlyDisplay(u)
    out.push({
      name: u.name,
      private_balance: priv,
      group_balance: grp,
      group_from_private: grpFromPriv,
      cycle_private: monthly.private,
      cycle_group: monthly.group,
      cycle_expires_at: monthly.expires_at,
      remaining_sessions: priv + grp,
    })
  }
  return out.sort((a, b) => b.remaining_sessions - a.remaining_sessions)
}

async function buildCoachHours(rangeFrom, rangeTo) {
  let allHours = await db.findAll('coach_daily_hours')
  if (rangeFrom) allHours = allHours.filter(h => h.date >= rangeFrom)
  if (rangeTo) allHours = allHours.filter(h => h.date <= rangeTo)
  const coaches = await db.findAll('users', u => u.role === 'coach')
  const coachMap = new Map(coaches.map(c => [c.id, c.name]))
  const rows = []
  for (const h of allHours) {
    rows.push({
      name: coachMap.get(h.coach_id) || `Coach #${h.coach_id}`,
      date: h.date,
      hours: Number(h.hours) || 0,
      notes: h.notes || '',
    })
  }
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.date || '').localeCompare(b.date || ''))
}

async function buildCoachBalances() {
  const coaches = await db.findAll('users', u => u.role === 'coach')
  const allHours = await db.findAll('coach_daily_hours')
  const allPayments = await db.findAll('coach_payments')
  return coaches.map(c => {
    const earned = allHours.filter(h => h.coach_id === c.id).reduce((s, h) => s + Number(h.hours), 0)
    const paid = allPayments.filter(p => p.coach_id === c.id).reduce((s, p) => s + Number(p.hours_deducted), 0)
    return { name: c.name, total_earned: earned, total_paid: paid, balance: earned - paid }
  }).sort((a, b) => b.balance - a.balance)
}

function addSheet(wb, name, headers, rows) {
  const sheet = wb.addWorksheet(name)
  sheet.columns = headers.map(h => ({ header: h.key, key: h.key, width: h.width || 18 }))
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) sheet.addRow(row)
  return sheet
}

// GET /reports/full-export — admin: multi-sheet Excel (one tab per section)
router.get('/full-export', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { from, to, preset } = req.query
    const { rangeFrom, rangeTo } = resolveRange(from, to, preset)
    const summary = await buildSummaryPayload(rangeFrom, rangeTo, preset)
    const remaining = await buildRemainingSessions()
    const coachHours = await buildCoachHours(rangeFrom, rangeTo)
    const coachBalances = await buildCoachBalances()

    const wb = new ExcelJS.Workbook()
    wb.creator = 'MM Padel Academy'
    wb.created = new Date()

    const rangeLabel = preset === 'custom'
      ? `${from || 'start'} to ${to || 'end'}`
      : preset === 'all'
        ? 'All Time'
        : preset === 'month'
          ? `${rangeFrom} to ${rangeTo} (full calendar month)`
          : preset === 'week'
            ? `${rangeFrom} to ${rangeTo} (rolling 7 days)`
            : `${rangeFrom || 'all'} to ${rangeTo || 'all'}`

    addSheet(wb, 'Summary', [
      { key: 'Metric', width: 28 }, { key: 'Value', width: 24 },
    ], [
      { Metric: 'Range', Value: rangeLabel },
      { Metric: 'Generated', Value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
      { Metric: 'Payments Received (EGP)', Value: summary.summary.payments_received },
      { Metric: 'Expenses (EGP)', Value: summary.summary.expenses },
      { Metric: 'Net Profit (EGP)', Value: summary.profit.net },
      { Metric: 'Sessions Played', Value: summary.summary.sessions_played },
      { Metric: 'New Players', Value: summary.summary.new_players },
      { Metric: 'Unpaid Amounts (EGP)', Value: summary.summary.unpaid_amounts },
      { Metric: 'Coach Hours', Value: summary.summary.coach_hours },
      { Metric: 'Remaining Sessions (total)', Value: remaining.reduce((s, p) => s + p.remaining_sessions, 0) },
    ])

    addSheet(wb, 'Payments', [
      { key: 'Date', width: 14 }, { key: 'Player', width: 24 },
      { key: 'Type', width: 14 }, { key: 'Amount (EGP)', width: 16 },
    ], summary.payments.map(p => ({ Date: p.date, Player: p.player, 'Type': p.session_type, 'Amount (EGP)': p.amount })))

    addSheet(wb, 'Sessions Per Player', [
      { key: 'Player', width: 28 }, { key: 'Sessions', width: 12 },
    ], summary.sessionsPerPlayer.map(p => ({ Player: p.name, Sessions: p.sessions })))

    addSheet(wb, 'Unpaid Players', [
      { key: 'Player', width: 24 }, { key: 'Unpaid Sessions', width: 16 },
      { key: 'Private', width: 12 }, { key: 'Group', width: 12 },
      { key: 'Amount Owed (EGP)', width: 18 },
    ], summary.unpaid.map(p => ({
      Player: p.name, 'Unpaid Sessions': p.unpaid_sessions,
      Private: p.unpaid_private, Group: p.unpaid_group, 'Amount Owed (EGP)': p.amount_owed,
    })))

    addSheet(wb, 'Remaining Sessions', [
      { key: 'Player', width: 24 }, { key: 'Private Remaining', width: 16 },
      { key: 'Group Remaining', width: 16 }, { key: 'Total Remaining', width: 16 },
    ], remaining.map(p => ({
      Player: p.name, 'Private Remaining': p.private_balance,
      'Group Remaining': p.group_balance, 'Total Remaining': p.remaining_sessions,
    })))

    addSheet(wb, 'Match Results', [
      { key: 'Player', width: 24 }, { key: 'Played', width: 10 },
      { key: 'Wins', width: 10 }, { key: 'Losses', width: 10 },
      { key: 'Top Partner', width: 20 }, { key: 'Top Opponent', width: 20 },
    ], summary.matchResults.map(p => ({
      Player: p.name, Played: p.played, Wins: p.wins, Losses: p.losses,
      'Top Partner': p.partners[0]?.name || '-',
      'Top Opponent': p.opponents[0]?.name || '-',
    })))

    addSheet(wb, 'Coach Hours', [
      { key: 'Coach', width: 24 }, { key: 'Date', width: 14 },
      { key: 'Hours', width: 10 }, { key: 'Notes', width: 30 },
    ], coachHours.map(c => ({ Coach: c.name, Date: c.date, Hours: c.hours, Notes: c.notes })))

    addSheet(wb, 'Coach Balances', [
      { key: 'Coach', width: 24 }, { key: 'Total Earned (h)', width: 16 },
      { key: 'Total Paid (h)', width: 16 }, { key: 'Balance (h)', width: 14 },
    ], coachBalances.map(c => ({
      Coach: c.name, 'Total Earned (h)': c.total_earned,
      'Total Paid (h)': c.total_paid, 'Balance (h)': c.balance,
    })))

    const rangeSlug = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=full_report_${rangeSlug}.xlsx`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Full report export error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
