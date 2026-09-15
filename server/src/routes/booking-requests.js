import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditUpdate } from '../middleware/audit.js'

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

// List requests
router.get('/', (req, res) => {
  try {
    const { status, kind, slot_id } = req.query
    let all = db.findAll('booking_requests')
    if (req.user.role === 'player') {
      all = all.filter(r => r.player_id === req.user.id)
    }
    if (status) all = all.filter(r => r.status === status)
    if (kind) all = all.filter(r => r.kind === kind)
    if (slot_id) all = all.filter(r => r.slot_id === parseInt(slot_id))
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json(all)
  } catch (err) {
    console.error('List booking requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Player responds to attendance confirm
router.put('/:id/respond', (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const request = db.get('booking_requests', id)
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.player_id !== req.user.id) return res.status(403).json({ error: 'Not your request' })

    const { response } = req.body
    if (response === 'yes') {
      db.update('booking_requests', id, { status: 'confirmed', decided_at: new Date().toISOString() })
      res.json({ ok: true, message: 'Attendance confirmed' })
    } else if (response === 'no') {
      db.update('booking_requests', id, { status: 'denied', decided_at: new Date().toISOString() })
      res.json({ ok: true, message: 'Please submit a cancel or modify request' })
    } else {
      return res.status(400).json({ error: 'Response must be yes or no' })
    }
  } catch (err) {
    console.error('Respond to request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Player submits cancel or modify request
router.post('/', (req, res) => {
  try {
    const { kind, slot_id, booking_id, payload } = req.body
    if (!kind || !slot_id) return res.status(400).json({ error: 'kind and slot_id are required' })
    if (!['cancel', 'modify'].includes(kind)) return res.status(400).json({ error: 'kind must be cancel or modify' })

    const slot = db.get('slots', parseInt(slot_id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })

    const request = db.insert('booking_requests', {
      kind,
      slot_id: parseInt(slot_id),
      booking_id: booking_id || slot.booking_id || null,
      player_id: req.user.id,
      player_name: req.user.name,
      payload: payload || {},
      status: 'pending',
    })

    const admins = db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
    for (const admin of admins) {
      notify(admin.id, `request_${kind}`,
        kind === 'cancel' ? 'Cancellation Requested' : 'Modification Requested',
        `${req.user.name} requested to ${kind} their slot on ${slot.date} at ${slot.time}.`,
        '/admin/bookings')
    }

    res.status(201).json(request)
  } catch (err) {
    console.error('Create request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin approves/denies a request
router.put('/:id/decide', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const request = db.get('booking_requests', id)
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already decided' })

    const { decision, proposed_date, proposed_time, proposed_court } = req.body
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or denied' })

    const slot = db.get('slots', request.slot_id)

    if (decision === 'approved') {
      if (request.kind === 'cancel') {
        if (slot) {
          // Set slot back to available
          db.update('slots', slot.id, { status: STATUS.AVAILABLE, player_text: '', booking_id: null, session_type: null, user_id: null })

          // Reverse balance credit (the payment_approved step credited, we need to undo it)
          if (slot.user_id && slot.status !== STATUS.PLAYER_CONFIRMED) {
            const user = db.get('users', slot.user_id)
            if (user) {
              const sessionType = slot.session_type || 'private'
              if (sessionType === 'private') {
                updateUserBalance(user.id, (user.private_balance || 0) - 1, user.group_balance || 0)
              } else {
                const grp = user.group_balance || 0
                if (grp > 0) {
                  updateUserBalance(user.id, user.private_balance || 0, grp - 1)
                } else {
                  updateUserBalance(user.id, (user.private_balance || 0) + 1, 0)
                }
              }
            }
          }
        }
        if (request.booking_id) {
          const booking = db.get('bookings', request.booking_id)
          if (booking) {
            // Check if all slots for this booking are cancelled or none left
            const remainingSlots = db.findAll('slots', s => s.booking_id === booking.id && s.status !== STATUS.AVAILABLE && s.status !== STATUS.CANCELLED)
            if (remainingSlots.length === 0) {
              db.update('bookings', booking.id, { status: 'cancelled' })
            }
            if (booking.user_id) {
              notify(booking.user_id, 'request_approved', 'Cancellation Approved',
                `Your cancellation request for ${slot?.date} ${slot?.time} has been approved. The slot is now available.`, '/schedule')
            }
          }
        }
      } else if (request.kind === 'modify') {
        if (slot && proposed_date && proposed_time) {
          const newCourt = proposed_court || slot.court
          const conflict = db.find('slots', s => s.date === proposed_date && s.time === proposed_time && s.court === newCourt && s.id !== slot.id)
          if (conflict) {
            return res.status(409).json({ error: 'Target slot is already occupied' })
          }
          db.update('slots', slot.id, { date: proposed_date, time: proposed_time, court: newCourt })
        }
        if (request.booking_id) {
          const booking = db.get('bookings', request.booking_id)
          if (booking && booking.user_id) {
            notify(booking.user_id, 'request_approved', 'Modification Approved',
              `Your slot has been moved to ${proposed_date} ${proposed_time}.`, '/schedule')
          }
        }
      } else if (request.kind === 'reschedule_offer') {
        if (slot && proposed_date && proposed_time) {
          const conflict = db.find('slots', s => s.date === proposed_date && s.time === proposed_time && s.court === (proposed_court || slot.court) && s.id !== slot.id)
          if (conflict) {
            return res.status(409).json({ error: 'Proposed slot is already occupied' })
          }
        }
        if (request.player_id) {
          notify(request.player_id, 'reschedule_offer', 'New Time Proposed',
            `Admin proposed ${proposed_date} ${proposed_time} for your slot. Please confirm or deny.`, '/profile')
        }
      }
    } else {
      // Denied
      if (request.kind === 'cancel') {
        if (request.player_id) {
          notify(request.player_id, 'request_denied', 'Cancellation Denied',
            `Your cancellation request for ${slot?.date} ${slot?.time} was denied.`, '/schedule')
        }
      } else {
        if (request.player_id) {
          notify(request.player_id, 'request_denied', 'Request Denied',
            `Your ${request.kind} request for ${slot?.date} ${slot?.time} was denied.`, '/schedule')
        }
      }
    }

    const updated = db.update('booking_requests', id, {
      status: decision,
      decided_by: req.user.id,
      decided_at: new Date().toISOString(),
      payload: { ...request.payload, proposed_date, proposed_time, proposed_court },
    })
    auditUpdate(req, 'booking_request', id, { status: request.status }, { status: decision, kind: request.kind, slot_id: request.slot_id })
    res.json(updated)
  } catch (err) {
    console.error('Decide request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
