import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

const STATUS = {
  AVAILABLE: 'available',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_APPROVED: 'payment_approved',
  SCHEDULE_APPROVED: 'schedule_approved',
  PLAYER_CONFIRMED: 'player_confirmed',
  CANCELLED: 'cancelled',
  DENIED: 'denied',
}

function genRef() { return 'MM-PDL-' + Math.floor(10000 + Math.random() * 90000) }
function genPayRef() {
  const count = db.count('payments')
  return `PAY-${String(count + 1).padStart(4, '0')}`
}

function notify(userId, kind, title, body, link) {
  if (!userId) return
  db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

function freeSlotsForBooking(booking) {
  if (!booking.sessions_json) return
  try {
    const sessions = JSON.parse(booking.sessions_json)
    for (const s of sessions) {
      const slots = db.findAll('slots', sl => sl.date === s.date && sl.time === s.time && sl.court === parseInt(s.court) && sl.booking_id === booking.id)
      for (const slot of slots) {
        db.remove('slots', slot.id)
      }
    }
  } catch (e) {
    console.error('Slot cleanup failed:', e)
  }
}

// List bookings
router.get('/', (req, res) => {
  try {
    const { status, page = 1, limit = 50, includeCancelled } = req.query
    let all = db.findAll('bookings')
    if (req.user.role === 'player') {
      all = all.filter(b => b.user_id === req.user.id)
      if (!includeCancelled) all = all.filter(b => b.status !== 'cancelled')
    }
    if (status) all = all.filter(b => b.status === status)
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const total = all.length
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
    const bookings = all.slice(offset, offset + parseInt(limit)).map(b => {
      const u = b.user_id ? db.get('users', b.user_id) : null
      const slots = db.findAll('slots', s => s.booking_id === b.id)
      return { ...b, user_name: u ? u.name : null, slot_count: slots.length, slot_statuses: [...new Set(slots.map(s => s.status))] }
    })
    res.json({ bookings, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('List bookings error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /balance-check — check if player has enough balance for a booking
router.get('/balance-check', (req, res) => {
  try {
    const { sessionType, count } = req.query
    if (!sessionType || !count) return res.status(400).json({ error: 'sessionType and count required' })
    const user = db.get('users', req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const n = parseInt(count) || 0
    const priv = user.private_balance || 0
    const grp = user.group_balance || 0
    let hasEnough = false
    if (sessionType === 'private') {
      hasEnough = priv >= n
    } else if (sessionType === 'group') {
      // Group can be covered by group balance, or private balance (1 private = 2 group)
      const effectiveGroup = grp + priv * 2
      hasEnough = effectiveGroup >= n
    }
    res.json({ hasEnough, private_balance: priv, group_balance: grp, sessionType, count: n })
  } catch (err) {
    console.error('Balance check error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /from-balance — book directly from balance (skip payment)
router.post('/from-balance', (req, res) => {
  try {
    const { sessionType, sessions } = req.body
    if (!sessionType || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'Missing booking data' })
    }

    const user = db.get('users', req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Verify sufficient balance
    const n = sessions.length
    const priv = user.private_balance || 0
    const grp = user.group_balance || 0
    let hasEnough = false
    if (sessionType === 'private') {
      hasEnough = priv >= n
    } else if (sessionType === 'group') {
      const effectiveGroup = grp + priv * 2
      hasEnough = effectiveGroup >= n
    }
    if (!hasEnough) return res.status(409).json({ error: 'Insufficient balance' })

    let ref = genRef()
    while (db.find('bookings', b => b.ref === ref)) ref = genRef()

    const booking = db.insert('bookings', {
      ref, user_id: req.user.id, session_type: sessionType, mode: 'balance',
      sessions_json: JSON.stringify(sessions), total: 0, status: STATUS.SCHEDULE_APPROVED,
      player_name: req.user.name,
    })

    // Create schedule_approved slots (no payment step, player confirms)
    for (const sess of sessions) {
      const existingSlot = db.find('slots', s => s.date === sess.date && s.time === sess.time && s.court === sess.court)
      if (!existingSlot) {
        db.insert('slots', {
          date: sess.date, time: sess.time, court: sess.court,
          player_text: req.user.name, booking_id: booking.id,
          user_id: req.user.id, session_type: sessionType, status: STATUS.SCHEDULE_APPROVED,
        })
      }
    }

    // Notify player to confirm
    for (const sess of sessions) {
      notify(req.user.id, 'schedule_approved', 'Awaiting Your Confirmation',
        `Your ${sessionType} session on ${sess.date} at ${sess.time} (Court ${sess.court}) has been booked from your balance. Please confirm your attendance.`,
        '/profile')
    }

    res.status(201).json({ booking, bookedFromBalance: true })
  } catch (err) {
    console.error('Book from balance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST / — create booking + slots + payment (player pays in-app)
router.post('/', (req, res) => {
  try {
    const { sessionType, mode, sessions, totalPrice, method } = req.body
    if (!sessionType || !sessions || !totalPrice) return res.status(400).json({ error: 'Missing booking data' })

    let ref = genRef()
    while (db.find('bookings', b => b.ref === ref)) ref = genRef()

    const booking = db.insert('bookings', {
      ref, user_id: req.user?.id || null, session_type: sessionType, mode,
      sessions_json: JSON.stringify(sessions), total: totalPrice, status: STATUS.PAYMENT_PENDING,
      player_name: req.user?.name || null,
    })

    // Create payment_pending slots for ALL sessions
    if (sessions && sessions.length > 0) {
      for (const sess of sessions) {
        const existingSlot = db.find('slots', s => s.date === sess.date && s.time === sess.time && s.court === sess.court)
        if (!existingSlot) {
          db.insert('slots', {
            date: sess.date, time: sess.time, court: sess.court,
            player_text: req.user?.name || 'Player', booking_id: booking.id,
            user_id: req.user?.id || null, session_type: sessionType, status: STATUS.PAYMENT_PENDING,
          })
        }
      }

      // Create payment record (payment_pending until admin approves)
      const payRef = genPayRef()
      db.insert('payments', {
        ref: payRef,
        date: new Date().toISOString().slice(0, 10),
        player_name: req.user?.name || 'Player',
        player_id: req.user?.id || null,
        method: method || 'Instapay',
        amount: parseFloat(totalPrice) || 0,
        private_sessions: sessionType === 'private' ? sessions.length : 0,
        group_sessions: sessionType === 'group' ? sessions.length : 0,
        notes: `Booking ${ref} — ${sessions.length} ${sessionType} sessions`,
        status: STATUS.PAYMENT_PENDING,
        booking_id: booking.id,
        created_by: req.user?.id || null,
      })

      // Notify admins
      const admins = db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
      for (const admin of admins) {
        db.insert('notifications', {
          user_id: admin.id, kind: 'new_payment',
          title: 'New Payment Pending',
          body: `${req.user?.name || 'Player'} submitted payment for ${sessionType} booking (${sessions.length} sessions).`,
          link: '/admin/bookings', read: 0,
        })
      }
    }

    res.status(201).json(booking)
  } catch (err) {
    console.error('Create booking error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/status — update booking status
router.put('/:id/status', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status } = req.body
    const valid = ['payment_pending', 'payment_approved', 'schedule_approved', 'player_confirmed', 'cancelled', 'denied']
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' })
    const booking = db.get('bookings', parseInt(req.params.id))
    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    const updates = { status }

    if (status === 'cancelled') {
      freeSlotsForBooking(booking)
    }

    const updated = db.update('bookings', parseInt(req.params.id), updates)
    res.json(updated)
  } catch (err) {
    console.error('Update booking error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/sessions — edit booking sessions
router.put('/:id/sessions', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const booking = db.get('bookings', parseInt(req.params.id))
    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    const { sessions, sessionType, total } = req.body
    if (!sessions || !Array.isArray(sessions)) return res.status(400).json({ error: 'Invalid sessions data' })

    const updates = {}
    updates.sessions_json = JSON.stringify(sessions)
    if (sessionType) updates.session_type = sessionType
    if (total !== undefined) updates.total = total

    if (booking.status === STATUS.PLAYER_CONFIRMED) {
      const oldSessions = JSON.parse(booking.sessions_json || '[]')
      const oldSet = new Set(oldSessions.map(s => `${s.date}|${s.time}|${s.court}`))
      const newSet = new Set(sessions.map(s => `${s.date}|${s.time}|${s.court}`))

      for (const key of oldSet) {
        if (!newSet.has(key)) {
          const [date, time, court] = key.split('|')
          const slots = db.findAll('slots', s => s.date === date && s.time === time && s.court === parseInt(court) && s.booking_id === booking.id)
          for (const slot of slots) db.remove('slots', slot.id)
        }
      }

      const playerName = booking.player_name || 'Player'
      for (const s of sessions) {
        db.upsert('slots',
          ['date', 'time', 'court'],
          { date: s.date, time: s.time, court: s.court, player_text: playerName, booking_id: booking.id, user_id: booking.user_id, session_type: sessionType || booking.session_type, status: STATUS.PLAYER_CONFIRMED }
        )
      }
    }

    const updated = db.update('bookings', parseInt(req.params.id), updates)
    res.json(updated)
  } catch (err) {
    console.error('Edit booking sessions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id
router.delete('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const booking = db.get('bookings', parseInt(req.params.id))
    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    freeSlotsForBooking(booking)

    // Reverse any payment credits if payment was approved
    const payment = db.find('payments', p => p.booking_id === booking.id)
    if (payment && payment.status === STATUS.PAYMENT_APPROVED && payment.player_id) {
      const user = db.get('users', payment.player_id)
      if (user) {
        db.update('users', payment.player_id, {
          private_balance: (user.private_balance || 0) - (payment.private_sessions || 0),
          group_balance: (user.group_balance || 0) - (payment.group_sessions || 0),
        })
      }
      db.remove('payments', payment.id)
    }

    db.remove('bookings', parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete booking error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
