import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditCreate, auditUpdate, auditDelete, auditBalanceChange } from '../middleware/audit.js'
import { creditCycle, ensureCycleFresh } from '../utils/balance.js'
import { notifyUser } from '../utils/notify.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

const STATUS = {
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
}

const EMPTY_SETTLEMENT = { settled_private: 0, settled_group: 0, credited_private: 0, credited_group: 0 }

async function generateRef() {
  const count = await db.count('payments')
  return `PAY-${String(count + 1).padStart(4, '0')}`
}

async function notify(userId, kind, title, body, link) {
  if (!userId) return
  await notifyUser({ userId, kind, title, body, link })
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
  let settlement = null
  if (isCash && player_id) {
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
      status: STATUS.PAYMENT_APPROVED,
      booking_id: booking_id || null,
      created_by: req.user?.id || null,
    })
    // Settle legacy debt first, then credit the remainder into the monthly
    // cycle (creditCycle opens its own tx — must stay outside any other tx)
    const userBefore = await db.get('users', player_id)
    const credit = await creditCycle(player_id, parseInt(private_sessions) || 0, parseInt(group_sessions) || 0)
    settlement = credit?.settlement || EMPTY_SETTLEMENT
    await db.update('payments', payment.id, {
      settled_private: settlement.settled_private,
      settled_group: settlement.settled_group,
      credited_private: settlement.credited_private,
      credited_group: settlement.credited_group,
    })
    payment = { ...payment, settled_private: settlement.settled_private, settled_group: settlement.settled_group, credited_private: settlement.credited_private, credited_group: settlement.credited_group }
    const userAfter = await db.get('users', player_id)
    const snap = (u) => u ? {
      private_balance: u.private_balance,
      group_balance: u.group_balance,
      cycle_private: u.cycle_private,
      cycle_group: u.cycle_group,
    } : null
    await auditCreate(req, 'payment', payment.id, { ref, method, amount, player_id, private_sessions, group_sessions, settlement })
    await auditBalanceChange(req, 'user', player_id, snap(userBefore), { ...snap(userAfter), settlement }, 'payment.credit.cycle')
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

  res.status(201).json(settlement ? { ...payment, settlement } : payment)
})

// PUT /:id/approve — approve payment, credit balance, move linked slots to payment_approved
router.put('/:id/approve', async (req, res) => {
  try {
    const payment = await db.get('payments', parseInt(req.params.id))
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== STATUS.PAYMENT_PENDING) return res.status(400).json({ error: 'Payment is not pending' })

    const userBefore = payment.player_id ? await db.get('users', payment.player_id) : null

    await db.transaction(async (tx) => {
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

    // Settle legacy debt first, then credit the remainder into the monthly
    // cycle after tx commit (does not stack on legacy)
    let settlement = null
    if (payment.player_id) {
      const privateAdd = parseInt(payment.private_sessions) || 0
      const groupAdd = parseInt(payment.group_sessions || 0)
      const credit = await creditCycle(payment.player_id, privateAdd, groupAdd)
      settlement = credit?.settlement || EMPTY_SETTLEMENT
      await db.update('payments', payment.id, {
        settled_private: settlement.settled_private,
        settled_group: settlement.settled_group,
        credited_private: settlement.credited_private,
        credited_group: settlement.credited_group,
      })
    }

    await auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_APPROVED, ref: payment.ref })
    if (payment.player_id) {
      const userAfter = await db.get('users', payment.player_id)
      await auditBalanceChange(req, 'user', payment.player_id,
        { private_balance: userBefore?.private_balance, group_balance: userBefore?.group_balance, cycle_private: userBefore?.cycle_private, cycle_group: userBefore?.cycle_group },
        { private_balance: userAfter?.private_balance, group_balance: userAfter?.group_balance, cycle_private: userAfter?.cycle_private, cycle_group: userAfter?.cycle_group, settlement },
        'payment.approve')
    }

    const updated = await db.get('payments', payment.id)

    if (payment.player_id && !payment.booking_id) {
      await notify(payment.player_id, 'payment_approved', 'Payment Approved',
        `Your payment ${payment.ref} has been approved. ${payment.private_sessions + payment.group_sessions} session(s) credited to your balance.`,
        '/profile')
    }

    res.json(settlement ? { ...updated, settlement } : updated)
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

// DELETE /:id — reverse the credit exactly:
//   * settlement rows: take back only what this payment credited (floor at the
//     current cycle remainder), then reinstate the debt it had forgiven
//     (legacy may go negative again — that debt is real again).
//   * pre-settlement rows: legacy behavior — sessions come out of the cycle
//     first, the legacy remainder is floored at 0.
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const payment = await db.get('payments', id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })

    if (payment.status === STATUS.PAYMENT_APPROVED && payment.player_id) {
      const user = await ensureCycleFresh(payment.player_id, { notify: false }) || await db.get('users', payment.player_id)
      if (user) {
        const hasSettlement = payment.credited_private != null || payment.credited_group != null
        let cycP = Math.max(0, user.cycle_private || 0)
        let cycG = Math.max(0, user.cycle_group || 0)
        const rawLegP = Number(user.private_balance) || 0
        const rawLegG = Number(user.group_balance) || 0
        let newLegP, newLegG, reversal

        if (hasSettlement) {
          const credP = Math.max(0, payment.credited_private || 0)
          const credG = Math.max(0, payment.credited_group || 0)
          const backP = Math.min(credP, cycP)
          const backG = Math.min(credG, cycG)
          cycP -= backP
          cycG -= backG
          newLegP = rawLegP - Math.max(0, payment.settled_private || 0)
          newLegG = rawLegG - Math.max(0, payment.settled_group || 0)
          reversal = {
            cycle: { private: backP, group: backG },
            reinstated_debt: { private: Math.max(0, payment.settled_private || 0), group: Math.max(0, payment.settled_group || 0) },
            uncredited_shortfall: { private: credP - backP, group: credG - backG },
          }
        } else {
          const privSessions = payment.private_sessions || 0
          const grpSessions = payment.group_sessions || 0
          const takeP = Math.min(privSessions, cycP)
          const takeG = Math.min(grpSessions, cycG)
          cycP -= takeP
          cycG -= takeG
          newLegP = Math.max(0, Math.max(0, rawLegP) - (privSessions - takeP))
          newLegG = Math.max(0, Math.max(0, rawLegG) - (grpSessions - takeG))
          reversal = {
            cycle: { private: takeP, group: takeG },
            legacy: { private: privSessions - takeP, group: grpSessions - takeG },
          }
        }
        const newCycP = cycP
        const newCycG = cycG

        await db.transaction(async (tx) => {
          await tx.update('users', user.id, {
            private_balance: newLegP, group_balance: newLegG,
            cycle_private: newCycP, cycle_group: newCycG,
          })
          await tx.remove('payments', id)
        })
        await auditDelete(req, 'payment', id, { ref: payment.ref, status: payment.status, player_id: payment.player_id, amount: payment.amount, settlement: hasSettlement ? { settled_private: payment.settled_private, settled_group: payment.settled_group, credited_private: payment.credited_private, credited_group: payment.credited_group } : null })
        await auditBalanceChange(req, 'user', payment.player_id,
          { private_balance: user.private_balance, group_balance: user.group_balance, cycle_private: user.cycle_private, cycle_group: user.cycle_group },
          { private_balance: newLegP, group_balance: newLegG, cycle_private: newCycP, cycle_group: newCycG, reversal },
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
