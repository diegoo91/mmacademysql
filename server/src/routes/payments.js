import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditUpdate, auditDelete } from '../middleware/audit.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

const STATUS = {
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
}

function generateRef() {
  const count = db.count('payments')
  return `PAY-${String(count + 1).padStart(4, '0')}`
}

function notify(userId, kind, title, body, link) {
  if (!userId) return
  db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

function updateUserBalance(userId, newPriv, newGrp) {
  const updates = { private_balance: newPriv, group_balance: newGrp }
  if (newPriv === 0 && newGrp === 0) {
    updates.balance_zero_since = new Date().toISOString()
  } else {
    updates.balance_zero_since = null
  }
  db.update('users', userId, updates)
}

// List payments (supports ?status filter)
router.get('/', (req, res) => {
  const { status } = req.query
  let payments = db.findAll('payments')
  if (status) payments = payments.filter(p => p.status === status)
  payments.sort((a, b) => new Date(b.date) - new Date(a.date))
  res.json(payments)
})

// POST / — create payment (admin manual or from player booking)
router.post('/', (req, res) => {
  const { date, player_name, player_id, method, amount, private_sessions, group_sessions, notes, booking_id } = req.body
  if (!date || !player_name || !method || amount === undefined) {
    return res.status(400).json({ error: 'date, player_name, method, and amount are required' })
  }
  if (!['Cash', 'Instapay'].includes(method)) {
    return res.status(400).json({ error: 'method must be Cash or Instapay' })
  }

  const ref = generateRef()

  // Cash = admin received money externally → credit immediately
  // Instapay = player paid in-app → pending until admin approves
  const isCash = method === 'Cash'
  const payment = db.insert('payments', {
    ref,
    date,
    player_name: player_name.trim(),
    player_id: player_id || null,
    method,
    amount: parseFloat(amount) || 0,
    private_sessions: parseInt(private_sessions) || 0,
    group_sessions: parseInt(group_sessions) || 0,
    notes: notes || '',
    status: isCash ? STATUS.PAYMENT_APPROVED : STATUS.PAYMENT_PENDING,
    booking_id: booking_id || null,
    created_by: req.user?.id || null,
  })

  if (isCash && player_id) {
    const user = db.get('users', player_id)
    if (user) {
      const privateAdd = parseInt(private_sessions) || 0
      const groupAdd = parseInt(group_sessions) || 0
      updateUserBalance(player_id, (user.private_balance || 0) + privateAdd, (user.group_balance || 0) + groupAdd)
    }
  }

  res.status(201).json(payment)
})

// PUT /:id/approve — approve payment, credit balance, move linked slots to payment_approved
router.put('/:id/approve', (req, res) => {
  try {
    const payment = db.get('payments', parseInt(req.params.id))
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== STATUS.PAYMENT_PENDING) return res.status(400).json({ error: 'Payment is not pending' })

    // Credit player balance
    if (payment.player_id) {
      const user = db.get('users', payment.player_id)
      if (user) {
        const privateAdd = parseInt(payment.private_sessions) || 0
        const groupAdd = parseInt(payment.group_sessions) || 0
        updateUserBalance(user.id, (user.private_balance || 0) + privateAdd, (user.group_balance || 0) + groupAdd)
      }
    }

    const updated = db.update('payments', payment.id, { status: STATUS.PAYMENT_APPROVED })
    auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_APPROVED, ref: payment.ref })

    // Move linked booking + slots to payment_approved
    if (payment.booking_id) {
      const booking = db.get('bookings', payment.booking_id)
      if (booking) {
        db.update('bookings', booking.id, { status: STATUS.PAYMENT_APPROVED })
        // Move all payment_pending slots for this booking to payment_approved
        const slots = db.findAll('slots', s => s.booking_id === booking.id && s.status === 'payment_pending')
        for (const slot of slots) {
          db.update('slots', slot.id, { status: STATUS.PAYMENT_APPROVED })
        }
        // Notify player
        if (booking.user_id) {
          notify(booking.user_id, 'payment_approved', 'Payment Approved',
            `Your payment ${payment.ref} has been approved. ${slots.length} session(s) are ready for schedule approval.`,
            '/profile')
        }
      }
    }

    // Notify player
    if (payment.player_id && !payment.booking_id) {
      notify(payment.player_id, 'payment_approved', 'Payment Approved',
        `Your payment ${payment.ref} has been approved. ${payment.private_sessions + payment.group_sessions} session(s) credited to your balance.`,
        '/profile')
    }

    res.json(updated)
  } catch (err) {
    console.error('Approve payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/reject — reject payment, move linked slots to denied
router.put('/:id/reject', (req, res) => {
  try {
    const payment = db.get('payments', parseInt(req.params.id))
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== STATUS.PAYMENT_PENDING) return res.status(400).json({ error: 'Payment is not pending' })

    const updated = db.update('payments', payment.id, { status: STATUS.PAYMENT_REJECTED })
    auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_REJECTED, ref: payment.ref })

    if (payment.booking_id) {
      const booking = db.get('bookings', payment.booking_id)
      if (booking) {
        db.update('bookings', booking.id, { status: 'denied' })
        const slots = db.findAll('slots', s => s.booking_id === booking.id && s.status === 'payment_pending')
        for (const slot of slots) {
          db.update('slots', slot.id, { status: 'denied' })
        }
        if (booking.user_id) {
          notify(booking.user_id, 'payment_rejected', 'Payment Rejected',
            `Your payment ${payment.ref} was not approved. Please contact the admin.`, '/profile')
        }
      }
    }

    res.json(updated)
  } catch (err) {
    console.error('Reject payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id
router.delete('/:id', (req, res) => {
  const payment = db.get('payments', parseInt(req.params.id))
  if (!payment) return res.status(404).json({ error: 'Payment not found' })

  auditDelete(req, 'payment', payment.id, { ref: payment.ref, status: payment.status, player_id: payment.player_id })

  // Reverse balance credits if payment was approved
  if (payment.status === STATUS.PAYMENT_APPROVED && payment.player_id) {
    const user = db.get('users', payment.player_id)
    if (user) {
      updateUserBalance(user.id,
        (user.private_balance || 0) - (payment.private_sessions || 0),
        (user.group_balance || 0) - (payment.group_sessions || 0),
      )
    }
  }

  db.remove('payments', parseInt(req.params.id))
  res.json({ ok: true })
})

export default router
