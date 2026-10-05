import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { auditCreate, auditUpdate, auditDelete, auditBalanceChange } from '../middleware/audit.js'
import { creditCycle, settleDebtWith, ensureCycleFresh } from '../utils/balance.js'
import { computePaymentAllocation } from '../utils/paymentAllocation.js'
import { notifyUser } from '../utils/notify.js'

const router = Router()
router.use(authenticate)
router.use(requirePermission('dashboard'))

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

/**
 * Apply a money-driven allocation to a player's balance:
 *   1. the covered part settles EXISTING unpaid sessions (legacy debt goes up,
 *      nothing enters the cycle — those sessions are consumed by the slots
 *      they pay for),
 *   2. the leftover part is credited through creditCycle (which settles any
 *      remaining debt first, then fills the cycle),
 *   3. the signed cash gap moves users.cash_balance (negative = shortfall
 *      owed next month, positive = prepaid carried forward).
 * Returns the combined settlement stored on the payment row.
 */
async function applyAllocation(playerId, allocation) {
  if (!allocation) return null
  const settled = await settleDebtWith(playerId, allocation.covered_private, allocation.covered_group)
  const credit = await creditCycle(playerId, allocation.credit_private, allocation.credit_group)
  const creditSettlement = credit?.settlement || EMPTY_SETTLEMENT
  const settledPart = settled?.settlement || EMPTY_SETTLEMENT
  const cashGap = Number(allocation.cash_gap) || 0
  if (cashGap !== 0) {
    const user = await db.get('users', playerId)
    const before = Number(user?.cash_balance) || 0
    await db.update('users', playerId, { cash_balance: before + cashGap })
  }
  return {
    settled_private: (settledPart.settled_private || 0) + (creditSettlement.settled_private || 0),
    settled_group: (settledPart.settled_group || 0) + (creditSettlement.settled_group || 0),
    credited_private: creditSettlement.credited_private || 0,
    credited_group: creditSettlement.credited_group || 0,
  }
}

async function storeSettlement(paymentId, settlement, cashGap = 0) {
  await db.update('payments', paymentId, {
    settled_private: settlement.settled_private,
    settled_group: settlement.settled_group,
    credited_private: settlement.credited_private,
    credited_group: settlement.credited_group,
    cash_gap: cashGap,
  })
}

// List payments (supports ?status filter)
router.get('/', async (req, res) => {
  const { status } = req.query
  let payments = await db.findAll('payments')
  if (status) payments = payments.filter(p => p.status === status)
  payments.sort((a, b) => new Date(b.date) - new Date(a.date))
  res.json(payments)
})

// GET /preview?player_id=&amount=&exclude_id= — dry-run of the money-driven
// allocation: what the amount covers (existing unpaid sessions, package priced)
// and what it credits as new sessions. Never writes anything.
router.get('/preview', async (req, res) => {
  try {
    const playerId = parseInt(req.query.player_id)
    const amount = parseFloat(req.query.amount) || 0
    const excludeId = parseInt(req.query.exclude_id) || null
    if (!playerId) return res.status(400).json({ error: 'player_id is required' })
    const player = await db.get('users', playerId)
    if (!player) return res.status(404).json({ error: 'Player not found' })

    const countsProvided = req.query.private_sessions !== undefined || req.query.group_sessions !== undefined
    const allocation = await computePaymentAllocation(player, {
      amount,
      private_sessions: countsProvided ? req.query.private_sessions : undefined,
      group_sessions: countsProvided ? req.query.group_sessions : undefined,
      excludePaymentId: excludeId,
    })
    res.json(allocation)
  } catch (err) {
    console.error('Payment preview error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
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
  const playerId = player_id ? parseInt(player_id) : null
  const player = playerId ? await db.get('users', playerId) : null

  // Money-driven allocation (manual payments only — booking-linked payments
  // are settled slot-by-slot by their own booking slots):
  //   amount  → settles EXISTING unpaid sessions first (package priced)
  //   leftover → new sessions credited to the balance
  // Admin-entered session counts override the derived totals.
  let allocation = null
  if (player && !booking_id) {
    allocation = await computePaymentAllocation(player, { amount, private_sessions, group_sessions })
  }
  const rowPrivate = allocation ? allocation.private_sessions : (parseInt(private_sessions) || 0)
  const rowGroup = allocation ? allocation.group_sessions : (parseInt(group_sessions) || 0)

  let payment
  let settlement = null
  if (isCash && playerId) {
    payment = await db.insert('payments', {
      ref,
      date,
      player_name: player_name.trim(),
      player_id: playerId,
      method,
      amount: parseFloat(amount) || 0,
      private_sessions: rowPrivate,
      group_sessions: rowGroup,
      notes: notes || '',
      status: STATUS.PAYMENT_APPROVED,
      booking_id: booking_id || null,
      created_by: req.user?.id || null,
    })
    const userBefore = await db.get('users', playerId)
    // Covered part settles old debt, leftover goes through the cycle
    // (creditCycle opens its own tx — must stay outside any other tx)
    if (allocation) {
      settlement = await applyAllocation(playerId, allocation)
    } else {
      const credit = await creditCycle(playerId, rowPrivate, rowGroup)
      settlement = credit?.settlement || EMPTY_SETTLEMENT
    }
    await storeSettlement(payment.id, settlement, allocation ? Number(allocation.cash_gap) || 0 : 0)
    payment = { ...payment, ...settlement }
    const userAfter = await db.get('users', playerId)
    const snap = (u) => u ? {
      private_balance: u.private_balance,
      group_balance: u.group_balance,
      cycle_private: u.cycle_private,
      cycle_group: u.cycle_group,
      cash_balance: u.cash_balance,
    } : null
    await auditCreate(req, 'payment', payment.id, { ref, method, amount, player_id: playerId, private_sessions: rowPrivate, group_sessions: rowGroup, allocation, settlement })
    await auditBalanceChange(req, 'user', playerId, snap(userBefore), { ...snap(userAfter), settlement }, 'payment.credit.cycle')
  } else {
    payment = await db.insert('payments', {
      ref,
      date,
      player_name: player_name.trim(),
      player_id: playerId,
      method,
      amount: parseFloat(amount) || 0,
      private_sessions: rowPrivate,
      group_sessions: rowGroup,
      notes: notes || '',
      status: isCash ? STATUS.PAYMENT_APPROVED : STATUS.PAYMENT_PENDING,
      booking_id: booking_id || null,
      created_by: req.user?.id || null,
    })
    await auditCreate(req, 'payment', payment.id, { ref, method, amount, player_id: playerId, status: payment.status, allocation })
  }

  res.status(201).json(settlement ? { ...payment, settlement, ...(allocation ? { allocation } : {}) } : { ...payment, ...(allocation ? { allocation } : {}) })
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

    // Money-driven: re-derive the split now (the unpaid state may have moved
    // since the payment was recorded) — covered part settles old debt, the
    // leftover is credited after tx commit (does not stack on legacy)
    let settlement = null
    let allocation = null
    if (payment.player_id && !payment.booking_id) {
      const player = await db.get('users', payment.player_id)
      if (player) {
        allocation = await computePaymentAllocation(player, { amount: payment.amount, excludePaymentId: payment.id })
        if (
          allocation.private_sessions !== (parseInt(payment.private_sessions) || 0) ||
          allocation.group_sessions !== (parseInt(payment.group_sessions) || 0)
        ) {
          await db.update('payments', payment.id, {
            private_sessions: allocation.private_sessions,
            group_sessions: allocation.group_sessions,
          })
        }
      }
    }
    if (payment.player_id) {
      if (allocation) {
        settlement = await applyAllocation(payment.player_id, allocation)
      } else {
        const privateAdd = parseInt(payment.private_sessions) || 0
        const groupAdd = parseInt(payment.group_sessions) || 0
        const credit = await creditCycle(payment.player_id, privateAdd, groupAdd)
        settlement = credit?.settlement || EMPTY_SETTLEMENT
      }
      await storeSettlement(payment.id, settlement, allocation ? Number(allocation.cash_gap) || 0 : 0)
    }

    await auditUpdate(req, 'payment', payment.id, { status: payment.status }, { status: STATUS.PAYMENT_APPROVED, ref: payment.ref, allocation, settlement })
    if (payment.player_id) {
      const userAfter = await db.get('users', payment.player_id)
      await auditBalanceChange(req, 'user', payment.player_id,
        { private_balance: userBefore?.private_balance, group_balance: userBefore?.group_balance, cycle_private: userBefore?.cycle_private, cycle_group: userBefore?.cycle_group, cash_balance: userBefore?.cash_balance },
        { private_balance: userAfter?.private_balance, group_balance: userAfter?.group_balance, cycle_private: userAfter?.cycle_private, cycle_group: userAfter?.cycle_group, cash_balance: userAfter?.cash_balance, settlement },
        'payment.approve')
    }

    const updated = await db.get('payments', payment.id)

    if (payment.player_id && !payment.booking_id) {
      await notify(payment.player_id, 'payment_approved', 'Payment Approved',
        `Your payment ${payment.ref} has been approved. ${(updated.private_sessions || 0) + (updated.group_sessions || 0)} session(s) credited to your balance.`,
        '/profile')
    }

    res.json(settlement ? { ...updated, settlement, ...(allocation ? { allocation } : {}) } : updated)
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

// Pure reversal of an approved payment's credit — shared with tests via
// utils/paymentReversal.js (same math for DELETE and PUT edit).
import { planPaymentReversal } from '../utils/paymentReversal.js'

// PUT /:id — edit a payment (date, amount, method, notes, player, session counts).
// The amount is the source of truth: without explicit session counts the row
// totals and the covered/credit split are re-derived (package priced) from it.
// Approved + credit-affecting changes (player, session counts, or amount when
// money-driven) are applied by reversing the old credit exactly (same math as
// DELETE) and re-applying the new one. Purely cosmetic edits (date/notes/
// method, amount on booking-linked payments) update the row only. Status
// changes go through approve/reject.
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const payment = await db.get('payments', id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })

    const { date, player_name, player_id, method, amount, private_sessions, group_sessions, notes } = req.body
    if (method !== undefined && !['Cash', 'Instapay'].includes(method)) {
      return res.status(400).json({ error: 'method must be Cash or Instapay' })
    }

    const edited = {
      date: date !== undefined && date ? String(date) : payment.date,
      player_name: player_name !== undefined ? String(player_name).trim() : payment.player_name,
      player_id: player_id !== undefined ? (player_id ? parseInt(player_id) : null) : payment.player_id,
      method: method !== undefined ? method : payment.method,
      amount: amount !== undefined ? Math.max(0, parseFloat(amount) || 0) : payment.amount,
      private_sessions: private_sessions !== undefined ? Math.max(0, parseInt(private_sessions) || 0) : payment.private_sessions,
      group_sessions: group_sessions !== undefined ? Math.max(0, parseInt(group_sessions) || 0) : payment.group_sessions,
      notes: notes !== undefined ? String(notes) : payment.notes,
    }

    const wasApproved = payment.status === STATUS.PAYMENT_APPROVED
    const num = (v) => Number(v) || 0
    const countsProvided = private_sessions !== undefined || group_sessions !== undefined

    // Money-driven re-derivation (manual payments): the amount decides the
    // totals and the covered/credit split unless the admin typed session
    // counts. excludePaymentId keeps this row's own credit from paying for
    // the very sessions it is covering. Booking-linked payments keep the
    // counts entered on the row.
    let allocation = null
    if (edited.player_id && !payment.booking_id) {
      const target = await db.get('users', edited.player_id)
      if (target) {
        allocation = await computePaymentAllocation(target, {
          amount: edited.amount,
          private_sessions: countsProvided ? edited.private_sessions : undefined,
          group_sessions: countsProvided ? edited.group_sessions : undefined,
          excludePaymentId: id,
        })
        if (!countsProvided) {
          edited.private_sessions = allocation.private_sessions
          edited.group_sessions = allocation.group_sessions
        }
      }
    }

    const playerChanged = (edited.player_id ?? null) !== (payment.player_id ?? null)
    const totalsChanged = num(edited.private_sessions) !== num(payment.private_sessions) ||
      num(edited.group_sessions) !== num(payment.group_sessions)
    const amountChanged = amount !== undefined && (Math.max(0, parseFloat(amount) || 0)) !== (parseFloat(payment.amount) || 0)
    // Amount edits only churn balances when they can change the split
    // (money-driven allocation); otherwise date/notes/method stay cosmetic.
    // `reapply: true` forces the reverse-and-recredit cycle even when nothing
    // on the row changes — used to backfill cash_gap on rows created before
    // the cash ledger existed (re-applied with identical values, so balances
    // settle to the same state while the gap gets recorded).
    const creditChanged = wasApproved && (playerChanged || totalsChanged || (amountChanged && !!allocation) ||
      (req.body.reapply === true && !!allocation))

    let userBefore = null
    let reversal = null
    let settlement = null

    // 1) Reverse the previous credit (only when the credit itself changes)
    if (creditChanged && payment.player_id) {
      const user = await ensureCycleFresh(payment.player_id, { notify: false }) || await db.get('users', payment.player_id)
      if (user) {
        userBefore = user
        const plan = planPaymentReversal(payment, user)
        await db.update('users', user.id, {
          private_balance: plan.newLegP, group_balance: plan.newLegG,
          cycle_private: plan.newCycP, cycle_group: plan.newCycG,
          // undo this payment's cash gap so the re-credit can apply the new one
          cash_balance: (Number(user.cash_balance) || 0) - (Number(payment.cash_gap) || 0),
        })
        reversal = plan.reversal
      }
    }

    // 2) Persist the edited fields
    const upd = { ...edited }
    if (wasApproved && (edited.player_id ?? null) === null) {
      // Credit target removed — nothing credited anymore
      upd.settled_private = null
      upd.settled_group = null
      upd.credited_private = null
      upd.credited_group = null
    }
    await db.update('payments', id, upd)

    // 3) Re-credit the new values (approved payments only; pending credits on approve)
    let newUserBefore = null
    if (creditChanged && edited.player_id) {
      newUserBefore = await db.get('users', edited.player_id)
      if (allocation) {
        settlement = await applyAllocation(edited.player_id, allocation)
      } else {
        const credit = await creditCycle(edited.player_id, num(edited.private_sessions), num(edited.group_sessions))
        settlement = credit?.settlement || EMPTY_SETTLEMENT
      }
      await storeSettlement(id, settlement, allocation ? Number(allocation.cash_gap) || 0 : 0)
    }

    const updated = await db.get('payments', id)

    await auditUpdate(req, 'payment', id,
      { ref: payment.ref, date: payment.date, player_id: payment.player_id, player_name: payment.player_name, method: payment.method, amount: payment.amount, private_sessions: payment.private_sessions, group_sessions: payment.group_sessions, notes: payment.notes, status: payment.status },
      { ref: updated.ref, date: updated.date, player_id: updated.player_id, player_name: updated.player_name, method: updated.method, amount: updated.amount, private_sessions: updated.private_sessions, group_sessions: updated.group_sessions, notes: updated.notes, status: updated.status, allocation, reversal, settlement })

    const snap = (u) => u ? {
      private_balance: u.private_balance, group_balance: u.group_balance,
      cycle_private: u.cycle_private, cycle_group: u.cycle_group,
      cash_balance: u.cash_balance,
    } : null
    if (reversal && userBefore) {
      const userMid = await db.get('users', payment.player_id)
      await auditBalanceChange(req, 'user', payment.player_id, snap(userBefore), { ...snap(userMid), reversal }, 'payment.edit.reverse')
    }
    if (settlement && edited.player_id) {
      const userAfter = await db.get('users', edited.player_id)
      await auditBalanceChange(req, 'user', edited.player_id, snap(newUserBefore), { ...snap(userAfter), settlement }, 'payment.edit.credit')
    }

    res.json({ ...updated, ...(settlement ? { settlement } : {}), ...(allocation ? { allocation } : {}) })
  } catch (err) {
    console.error('Edit payment error:', err)
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
        const { newLegP, newLegG, newCycP, newCycG, reversal, hasSettlement } = planPaymentReversal(payment, user)

        await db.transaction(async (tx) => {
          await tx.update('users', user.id, {
            private_balance: newLegP, group_balance: newLegG,
            cycle_private: newCycP, cycle_group: newCycG,
            // undo this payment's cash gap (delete restores the ledger exactly)
            cash_balance: (Number(user.cash_balance) || 0) - (Number(payment.cash_gap) || 0),
          })
          await tx.remove('payments', id)
        })
        await auditDelete(req, 'payment', id, { ref: payment.ref, status: payment.status, player_id: payment.player_id, amount: payment.amount, settlement: hasSettlement ? { settled_private: payment.settled_private, settled_group: payment.settled_group, credited_private: payment.credited_private, credited_group: payment.credited_group } : null })
        await auditBalanceChange(req, 'user', payment.player_id,
          { private_balance: user.private_balance, group_balance: user.group_balance, cycle_private: user.cycle_private, cycle_group: user.cycle_group, cash_balance: user.cash_balance },
          { private_balance: newLegP, group_balance: newLegG, cycle_private: newCycP, cycle_group: newCycG, cash_balance: (Number(user.cash_balance) || 0) - (Number(payment.cash_gap) || 0), reversal },
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
