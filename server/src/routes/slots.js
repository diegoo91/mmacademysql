import { Router } from 'express'
import db from '../database.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditUpdate } from '../middleware/audit.js'

const router = Router()

// Cairo timezone helpers for today check
function getCairoToday() {
  const now = new Date()
  const cairoStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
  return cairoStr
}

function isSlotDateFutureOrToday(dateStr) {
  return dateStr >= getCairoToday()
}

// Valid slot statuses in order
const STATUS = {
  AVAILABLE: 'available',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_APPROVED: 'payment_approved',
  SCHEDULE_APPROVED: 'schedule_approved',
  PLAYER_CONFIRMED: 'player_confirmed',
  CANCELLED: 'cancelled',
  DENIED: 'denied',
}

const PLAYER_VISIBLE_STATUSES = [STATUS.PLAYER_CONFIRMED]

router.get('/', optionalAuth, (req, res) => {
  try {
    const { from, to, court, status, visible_only } = req.query
    let all = db.findAll('slots')
    if (from) all = all.filter(s => s.date >= from)
    if (to) all = all.filter(s => s.date <= to)
    if (court) all = all.filter(s => s.court === parseInt(court))
    if (status) all = all.filter(s => s.status === status)
    if (visible_only === '1') all = all.filter(s => PLAYER_VISIBLE_STATUSES.includes(s.status))
    all.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.court - b.court)

    // Enrich slots with coach name
    const coaches = db.findAll('users', u => u.role === 'coach')
    const coachMap = new Map(coaches.map(c => [c.id, c.name]))
    const enriched = all.map(s => ({ ...s, coach_name: s.coach_id ? coachMap.get(s.coach_id) || null : null }))

    res.json(enriched)
  } catch (err) {
    console.error('List slots error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Court defaults — coach assigned per court (standing default)
router.get('/court-defaults', (req, res) => {
  try {
    const defaults = db.findAll('court_defaults')
    res.json(defaults)
  } catch (err) {
    console.error('Get court defaults error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/court-defaults', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { court, coach_id } = req.body
    if (!court) return res.status(400).json({ error: 'court is required' })
    const existing = db.find('court_defaults', cd => cd.court === parseInt(court))
    if (existing) {
      const updated = db.update('court_defaults', existing.id, { coach_id: coach_id || null })
      return res.json(updated)
    }
    const created = db.insert('court_defaults', { court: parseInt(court), coach_id: coach_id || null })
    res.json(created)
  } catch (err) {
    console.error('Update court defaults error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.use(authenticate)

function notifyUser(userId, kind, title, body, link) {
  if (!userId) return
  db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

function findPlayerUser(playerText) {
  if (!playerText) return null
  const name = playerText.split(/\s*\/\s*/)[0].trim()
  return db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
}

function getBalanceInfo(player) {
  if (!player) return null
  return {
    name: player.name,
    private_balance: player.private_balance || 0,
    group_balance: player.group_balance || 0,
  }
}

function findPlayerUserById(userId) {
  if (!userId) return null
  return db.get('users', userId)
}

function creditBalance(userId, sessionType, count) {
  const user = db.get('users', userId)
  if (!user) return
  if (sessionType === 'private') {
    db.update('users', userId, {
      private_balance: (user.private_balance || 0) + count,
      balance_zero_since: null,
    })
  } else if (sessionType === 'group') {
    db.update('users', userId, {
      group_balance: (user.group_balance || 0) + count,
      balance_zero_since: null,
    })
  }
}

function deductBalance(userId, sessionType) {
  const user = db.get('users', userId)
  if (!user) return false

  if (sessionType === 'private') {
    if ((user.private_balance || 0) <= 0) return false
    db.update('users', userId, { private_balance: (user.private_balance || 0) - 1 })
    return true
  } else {
    const grp = user.group_balance || 0
    const priv = user.private_balance || 0
    if (grp > 0) {
      db.update('users', userId, { group_balance: grp - 1 })
      return true
    } else if (priv > 0) {
      db.update('users', userId, { private_balance: priv - 1, group_balance: (user.group_balance || 0) + 2 })
      return true
    }
    return false
  }
}

function reverseBalanceCredit(userId, sessionType) {
  const user = db.get('users', userId)
  if (!user) return
  if (sessionType === 'private') {
    db.update('users', userId, { private_balance: (user.private_balance || 0) - 1 })
  } else if (sessionType === 'group') {
    const grp = user.group_balance || 0
    if (grp > 0) {
      db.update('users', userId, { group_balance: grp - 1 })
    } else {
      // Group was converted from private on deduct, so reverse by converting back
      db.update('users', userId, { group_balance: 0, private_balance: (user.private_balance || 0) + 1 })
    }
  }
}

// PUT /:id — generic update (admin edits slot fields)
router.put('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const slot = db.get('slots', id)
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    const { player_text, date, time, court, session_type, status, balanceOverride, coach_id } = req.body
    const err = validateLength('Player', player_text, LIMITS.playerText)
    if (err) return res.status(400).json({ error: err })
    const newDate = date || slot.date
    const newTime = time || slot.time
    const newCourt = court || slot.court
    const conflict = db.find('slots', s => s.id !== id && s.date === newDate && s.time === newTime && s.court === newCourt)
    if (conflict) return res.status(409).json({ error: 'Slot already exists at this date/time/court' })

    const updates = {
      player_text: player_text ?? slot.player_text,
      date: newDate, time: newTime, court: newCourt,
      session_type: session_type !== undefined ? session_type : slot.session_type,
      coach_id: coach_id !== undefined ? coach_id : slot.coach_id,
      status: status || slot.status,
    }

    if (player_text !== undefined) {
      if (!player_text?.trim()) {
        updates.status = STATUS.AVAILABLE
        updates.session_type = null
        updates.booking_id = null
        updates.user_id = null
      } else if (!slot.player_text?.trim() && player_text?.trim()) {
        // Admin assigning a player to an empty slot
        const stype = session_type || slot.session_type || 'private'
        const isFuture = isSlotDateFutureOrToday(newDate)
        updates.status = isFuture ? STATUS.SCHEDULE_APPROVED : STATUS.PLAYER_CONFIRMED
        const player = findPlayerUser(player_text)
        if (player) {
          updates.user_id = player.id
          const balanceInfo = getBalanceInfo(player)
          const hasEnough = (stype === 'private' && (player.private_balance || 0) > 0) ||
                            (stype === 'group' && (player.group_balance || 0) > 0)
          if (!hasEnough) {
            if (balanceOverride === 'free') {
              // Bonus session — no deduction
            } else if (balanceOverride === 'deduct') {
              if (!isFuture) deductBalance(player.id, stype)
            } else {
              return res.status(409).json({
                code: 'INSUFFICIENT_BALANCE',
                player: player.name,
                sessionType: stype,
                remaining: balanceInfo[stype + '_balance'],
                needed: 1,
              })
            }
          } else {
            if (isFuture) {
              // Future: deduct on player confirm (PUT /:id/confirm), not now
            } else {
              deductBalance(player.id, stype)
            }
          }

          if (isFuture) {
            notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
              `A ${stype} session on ${newDate} at ${newTime} (Court ${newCourt}) has been assigned to you. Please confirm your attendance.`,
              '/profile')
          }
        }
      }
    }

    const updated = db.update('slots', id, updates)

    if (session_type !== undefined && session_type !== slot.session_type && slot.booking_id) {
      const booking = db.get('bookings', slot.booking_id)
      if (booking) db.update('bookings', booking.id, { session_type })
    }

    res.json(updated)
  } catch (err) {
    console.error('Update slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST / — create slot (admin manual)
router.post('/', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { date, time, court, player_text, session_type, balanceOverride, coach_id } = req.body
    if (!date || !time || !court) return res.status(400).json({ error: 'Date, time, and court are required' })
    const err = validateLength('Player', player_text, LIMITS.playerText)
    if (err) return res.status(400).json({ error: err })
    if (db.find('slots', s => s.date === date && s.time === time && s.court === court)) return res.status(409).json({ error: 'Slot already exists' })

    const hasPlayer = player_text?.trim()
    const slotSessionType = session_type || 'private'

    if (hasPlayer) {
      const player = findPlayerUser(player_text)
      if (player) {
        const balanceInfo = getBalanceInfo(player)
        const hasEnough = (slotSessionType === 'private' && (player.private_balance || 0) > 0) ||
                          (slotSessionType === 'group' && (player.group_balance || 0) > 0)
        if (!hasEnough) {
          if (balanceOverride === 'free') {
            // Bonus session — create slot confirmed, no deduction
          } else if (balanceOverride === 'deduct') {
            deductBalance(player.id, slotSessionType)
          } else {
            return res.status(409).json({
              code: 'INSUFFICIENT_BALANCE',
              player: player.name,
              sessionType: slotSessionType,
              remaining: balanceInfo[slotSessionType + '_balance'],
              needed: 1,
            })
          }
        } else {
          const ok = deductBalance(player.id, slotSessionType)
          if (!ok) {
            if (balanceOverride === 'free') {
              // Bonus session — no deduction
            } else if (balanceOverride === 'deduct') {
              deductBalance(player.id, slotSessionType)
            } else {
              return res.status(409).json({
                code: 'INSUFFICIENT_BALANCE',
                player: player.name,
                sessionType: slotSessionType,
                remaining: balanceInfo[slotSessionType + '_balance'],
                needed: 1,
              })
            }
          }
        }
        const slot = db.insert('slots', { date, time, court, player_text, session_type: slotSessionType, coach_id: coach_id || null, status: isSlotDateFutureOrToday(date) ? STATUS.SCHEDULE_APPROVED : STATUS.PLAYER_CONFIRMED, booking_id: null, user_id: player.id })

        // Notify player for future/today slots (past slots are auto-confirmed, no notification)
        if (isSlotDateFutureOrToday(date)) {
          notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
            `A ${slotSessionType} session on ${date} at ${time} (Court ${court}) has been assigned to you. Please confirm your attendance.`,
            '/profile')
        }

        return res.status(201).json(slot)
      }
    }

    const slot = db.insert('slots', { date, time, court, player_text: player_text || '', session_type: hasPlayer ? slotSessionType : null, coach_id: coach_id || null, status: STATUS.AVAILABLE, booking_id: null })
    res.status(201).json(slot)
  } catch (err) {
    console.error('Create slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id
router.delete('/:id', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    if (!db.get('slots', parseInt(req.params.id))) return res.status(404).json({ error: 'Slot not found' })
    db.remove('slots', parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/approve — old approve for pending (now only for payment_approved → schedule_approved per-slot)
router.put('/:id/approve', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const slot = db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.PAYMENT_APPROVED) return res.status(400).json({ error: 'Slot must be payment_approved to approve' })

    const updated = db.update('slots', slot.id, { status: STATUS.SCHEDULE_APPROVED })

    const player = slot.user_id ? findPlayerUserById(slot.user_id) : findPlayerUser(slot.player_text)
    if (player) {
      notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
        `Your ${slot.session_type || 'session'} on ${slot.date} at ${slot.time} (Court ${slot.court}) has been approved by admin. Please confirm your attendance.`,
        '/profile')
    }

    res.json(updated)
  } catch (err) {
    console.error('Approve slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/toggle-type
router.put('/:id/toggle-type', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const slot = db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (!slot.player_text || !slot.player_text.trim()) return res.status(400).json({ error: 'Empty slot has no type' })

    const newType = slot.session_type === 'private' ? 'group' : 'private'
    const updated = db.update('slots', slot.id, { session_type: newType })

    const player = slot.user_id ? findPlayerUserById(slot.user_id) : findPlayerUser(slot.player_text)
    if (player) {
      notifyUser(player.id, 'type_changed', 'Session Type Updated',
        `Your session on ${slot.date} at ${slot.time} (Court ${slot.court}) has been changed to ${newType}.`,
        '/schedule')
    }

    res.json(updated)
  } catch (err) {
    console.error('Toggle type error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/confirm — player confirms attendance (schedule_approved → player_confirmed)
router.put('/:id/confirm', (req, res) => {
  try {
    const slot = db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.SCHEDULE_APPROVED) return res.status(400).json({ error: 'Slot must be schedule_approved' })

    // Verify the player owns this slot
    if (slot.user_id && slot.user_id !== req.user.id && req.user.role === 'player') {
      return res.status(403).json({ error: 'Not your slot' })
    }

    // Deduct from balance
    const userId = slot.user_id
    if (userId) {
      const sessionType = slot.session_type || 'private'
      const ok = deductBalance(userId, sessionType)
      if (!ok) return res.status(400).json({ error: 'Insufficient balance to confirm this session' })
    }

    const updated = db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
    auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: STATUS.PLAYER_CONFIRMED })

    if (userId) {
      notifyUser(userId, 'player_confirmed', 'Attendance Confirmed',
        `Your ${slot.session_type || 'session'} on ${slot.date} at ${slot.time} (Court ${slot.court}) is confirmed.`,
        '/schedule')
    }

    res.json(updated)
  } catch (err) {
    console.error('Player confirm error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/decline — player declines, creates cancel request (schedule_approved → cancel request)
router.put('/:id/decline', (req, res) => {
  try {
    const slot = db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.SCHEDULE_APPROVED) return res.status(400).json({ error: 'Slot must be schedule_approved' })

    if (slot.user_id && slot.user_id !== req.user.id && req.user.role === 'player') {
      return res.status(403).json({ error: 'Not your slot' })
    }

    // Create a cancel request routed to admin
    const request = db.insert('booking_requests', {
      kind: 'cancel',
      slot_id: slot.id,
      booking_id: slot.booking_id || null,
      player_id: req.user.id,
      player_name: req.user.name,
      payload: { date: slot.date, time: slot.time, court: slot.court },
      status: 'pending',
    })

    const admins = db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
    for (const admin of admins) {
      notifyUser(admin.id, 'request_cancel',
        'Cancellation Requested',
        `${req.user.name} wants to cancel their slot on ${slot.date} at ${slot.time} (Court ${slot.court}).`,
        '/admin/bookings')
    }

    res.json({ ok: true, message: 'Cancellation request submitted to admin', request })
  } catch (err) {
    console.error('Player decline error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/mark-attended — admin forces schedule_approved → player_confirmed (retroactive deduction)
router.put('/:id/mark-attended', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const slot = db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })

    // Can mark attended on schedule_approved or even payment_approved (player showed up without going through flow)
    if (![STATUS.SCHEDULE_APPROVED, STATUS.PAYMENT_APPROVED, STATUS.PAYMENT_PENDING].includes(slot.status)) {
      return res.status(400).json({ error: 'Slot cannot be mark-attended from current status' })
    }

    const userId = slot.user_id
    if (userId) {
      const sessionType = slot.session_type || 'private'
      const ok = deductBalance(userId, sessionType)
      if (!ok) return res.status(400).json({ error: 'Insufficient balance' })
    }

    const updated = db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })

    if (userId) {
      notifyUser(userId, 'mark_attended', 'Session Marked Attended',
        `Your session on ${slot.date} at ${slot.time} (Court ${slot.court}) has been marked as attended.`,
        '/schedule')
    }

    res.json(updated)
  } catch (err) {
    console.error('Mark attended error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /day/:date/approve — batch approve all payment_approved slots on a date → schedule_approved
router.put('/day/:date/approve', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { date } = req.params
    const slots = db.findAll('slots', s => s.date === date && s.status === STATUS.PAYMENT_APPROVED)
    if (slots.length === 0) return res.json({ approved: 0, message: 'No payment_approved slots for this date' })

    let count = 0
    for (const slot of slots) {
      db.update('slots', slot.id, { status: STATUS.SCHEDULE_APPROVED })
      count++

      const player = slot.user_id ? findPlayerUserById(slot.user_id) : findPlayerUser(slot.player_text)
      if (player) {
        notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
          `Your ${slot.session_type || 'session'} on ${slot.date} at ${slot.time} (Court ${slot.court}) is approved. Please confirm your attendance.`,
          '/profile')
      }
    }
    auditUpdate(req, 'slots', null, { date, count: slots.length }, { date, action: 'day_approve', count })

    res.json({ approved: count })
  } catch (err) {
    console.error('Approve day error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /day/:date/undo — batch revert schedule_approved slots on a date → payment_approved
router.put('/day/:date/undo', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { date } = req.params
    const slots = db.findAll('slots', s => s.date === date && s.status === STATUS.SCHEDULE_APPROVED)
    if (slots.length === 0) return res.json({ reverted: 0, message: 'No schedule_approved slots for this date' })

    let count = 0
    for (const slot of slots) {
      db.update('slots', slot.id, { status: STATUS.PAYMENT_APPROVED })
      count++

      const player = slot.user_id ? findPlayerUserById(slot.user_id) : findPlayerUser(slot.player_text)
      if (player) {
        notifyUser(player.id, 'day_approval_reverted', 'Schedule Approval Reverted',
          `The schedule approval for ${slot.date} at ${slot.time} (Court ${slot.court}) has been reverted. You no longer need to confirm this slot.`,
          '/schedule')
      }
    }
    auditUpdate(req, 'slots', null, { date, count: slots.length }, { date, action: 'day_undo', count })

    res.json({ reverted: count })
  } catch (err) {
    console.error('Undo day approval error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
