import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditCreate, auditUpdate, auditDelete, auditBalanceChange } from '../middleware/audit.js'
import { hasEnoughBalance, effectiveGroup } from '../utils/balance.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

const STATUS = {
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
}

async function generateRef() {
  const count = await db.count('payments')
  return `PAY-${String(count + 1).padStart(4, '0')}`
}

async function notify(userId, kind, title, body, link) {
  if (!userId) return
  await db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

// List payments (supports ?status filter)
router.get('/', async (req, res) => {
  const { status } = req.query
  let payments = await db.findAll('payments')
  if (status) payments = payments.filter(p => p.status === status)
  payments.sort((a, b) => new Date(b.date) - new Date(a.date))
  res.json(payments)
})

// POST / — create payment (admin manual or from player booking)
router.post('/', async (req, res) => {
  const { date, player_name, player_id, method, amount, private_sessions, group_sessions, notes, booking_id } = req.body
  if (!date || !player_name || !method || amount === undefined) {
    return res.status(400).json({ error: 'date, player_name, method, and amount are required' })
  }
  if (!['Cash', 'Instapay'].includes(method)) {
    return res.status(400).json({ error: 'method must be Cash or Instapay' })
  }

  const ref = await generateRef()

  // Cash = admin received money externally → credit immediately
  // Instapay = player paid in-app → pending until admin approves
  const isCash = method === 'Cash'

  let payment
  if (isCash && player_id) {
    payment = await db.transaction(async (tx) => {
      const p = await tx.insert('payments', {
        ref,
        date,
        player_name: player_name.trim(),
        player_id: player_id || null,
        method,
        amount: parseFloat(amount) || 0,
        private_sessions: parseInt(private_sessions) || 0,
        group_sessions: parseInt(group_sessions) || 0,
        notes: notes || '',
        status: STATUS.PAYMENT_APPROVED,
        booking_id: booking_id || null,
        created_by: req.user?.id || null,
      })
      const user = await tx.get('users', player_id)
      if (user) {
        const privateAdd = parseInt(private_sessions) || 0
        const groupAdd = parseInt(group_sessions) || 0
        await tx.update('users', player_id, {
          private_balance: (user.private_balance || 0) + privateAdd,
          group_balance: (user.group_balance || 0) + groupAdd,
        })
      }
      return p
    })
    await auditCreate(req, 'payment', payment.id, { ref, method, amount, player_id, private_sessions, group_sessions })
    await auditBalanceChange(req, 'user', player_id, null, null, 'balance.credit')
  } else {
    payment = await db.insert('payments', {
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
    await auditCreate(req, 'payment', payment.id, { ref, method, amount, player_id, status: payment.status })
  }

  res.status(201).json(payment)
})

// PUT /:id/approve — approve payment, credit balance, move linked slots to payment_approved
router.put('/:id/approve', async (req, res) => {
  try {
    const payment = await db.get('payments', parseInt(req.params.id))
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== STATUS.PAYMENT_PENDING) return res.status(400).json({ error: 'Payment is not pending' })

    const userBefore = payment.player_id ? await db.get('users', payment.player_id) : null

    await db.transaction(async (tx) => {
      if (payment.player_id) {
        const user = userBefore
        if (user) {
          const privateAdd = parseInt(payment.private_sessions) || 0
          const groupAdd = parseInt(payment.group_sessions || 0)
          const newPriv = (user.private_balance || 0) + privateAdd
          const newGrp = (user.group_balance || 0) + groupAdd
          const updates = { private_balance: newPriv, group_balance: newGrp }
          if (newPriv === 0 && newGrp === 0) updates.balance_zero_since = new Date().toISOString()
          else updates.balance_zero_since = null
          await tx.update('users', user.id, updates)
        }
      }

      await tx.update('payments', payment.id, { status: STATUS.PAYMENT_APPROVED })

      if (payment.booking_id) {
        const booking = await tx.get('bookings', payment.booking_id)
        if (booking) {
          await tx.update('bookings', booking.id, { status: STATUS.PAYMENT_APPROVED })
          const slots = await tx.findAll('slots', s => s.booking_id === booking.id && s.status === 'payment_pending')
          for (const slot of slots) {
            await tx.update('slots', slot.id, { status: STATUS.PAYMENT_APPROVED })
          }
          if (booking.user_id) {
            await notify(booking.user_id, 'payment_approved', 'Payment Approved',
              `Your payment ${payment.ref} has been approved. ${slots.length} session(s) are ready for schedule approval.`,
              '/profile')
          }
        }
      }
    })

    await auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_APPROVED, ref: payment.ref })
    if (payment.player_id) {
      const userAfter = await db.get('users', payment.player_id)
      await auditBalanceChange(req, 'user', payment.player_id,
        { private_balance: userBefore?.private_balance, group_balance: userBefore?.group_balance },
        { private_balance: userAfter?.private_balance, group_balance: userAfter?.group_balance },
        'payment.approve')
    }

    const updated = await db.get('payments', payment.id)

    if (payment.player_id && !payment.booking_id) {
      await notify(payment.player_id, 'payment_approved', 'Payment Approved',
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
router.put('/:id/reject', async (req, res) => {
  try {
    const payment = await db.get('payments', parseInt(req.params.id))
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== STATUS.PAYMENT_PENDING) return res.status(400).json({ error: 'Payment is not pending' })

    await db.transaction(async (tx) => {
      await tx.update('payments', payment.id, { status: STATUS.PAYMENT_REJECTED })

      if (payment.booking_id) {
        const booking = await tx.get('bookings', payment.booking_id)
        if (booking) {
          await tx.update('bookings', booking.id, { status: 'denied' })
          const slots = await tx.findAll('slots', s => s.booking_id === booking.id && s.status === 'payment_pending')
          for (const slot of slots) {
            await tx.update('slots', slot.id, { status: 'denied' })
          }
          if (booking.user_id) {
            await notify(booking.user_id, 'payment_rejected', 'Payment Rejected',
              `Your payment ${payment.ref} was not approved. Please contact the admin.`, '/profile')
          }
        }
      }
    })

    await auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_REJECTED, ref: payment.ref })

    const updated = await db.get('payments', payment.id)
    res.json(updated)
  } catch (err) {
    console.error('Reject payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id — reverse balance, clamp at 0, reject if would go negative
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const payment = await db.get('payments', id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })

    if (payment.status === STATUS.PAYMENT_APPROVED && payment.player_id) {
      const user = await db.get('users', payment.player_id)
      if (user) {
        const privSessions = payment.private_sessions || 0
        const grpSessions = payment.group_sessions || 0
        const newPriv = Math.max(0, (user.private_balance || 0) - privSessions)
        const newGrp = Math.max(0, (user.group_balance || 0) - grpSessions)
        // Reject if reversal would reduce balance below zero
        if (newPriv !== (user.private_balance || 0) - privSessions || newGrp !== (user.group_balance || 0) - grpSessions) {
          return res.status(409).json({
            error: 'Cannot reverse: balance would go negative',
            current: { private_balance: user.private_balance, group_balance: user.group_balance },
            trying_to_reverse: { private_sessions: privSessions, group_sessions: grpSessions },
          })
        }
        await db.transaction(async (tx) => {
          await tx.update('users', user.id, { private_balance: newPriv, group_balance: newGrp })
          await tx.remove('payments', id)
        })
        await auditDelete(req, 'payment', id, { ref: payment.ref, status: payment.status, player_id: payment.player_id, amount: payment.amount })
        await auditBalanceChange(req, 'user', payment.player_id,
          { private_balance: user.private_balance, group_balance: user.group_balance },
          { private_balance: newPriv, group_balance: newGrp },
          'payment.delete.reverse')
      } else {
        await db.remove('payments', id)
        await auditDelete(req, 'payment', id, { ref: payment.ref, status: payment.status, player_id: payment.player_id, amount: payment.amount })
      }
    } else {
      await db.remove('payments', id)
      await auditDelete(req, 'payment', id, { ref: payment.ref, status: payment.status, player_id: payment.player_id, amount: payment.amount })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Delete payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
