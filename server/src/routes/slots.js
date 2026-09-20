import { Router } from 'express'
import db from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditCreate, auditUpdate, auditDelete } from '../middleware/audit.js'
import { hasEnoughBalance, deductBalance, deductBalanceAllowNegative, creditBalance, reverseBalance } from '../utils/balance.js'

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

// Validate player count vs session_type
function validatePlayerCount(names, sessionType) {
  if (sessionType === 'private' && names.length > 1) {
    return 'Private session can only have 1 player'
  }
  if (sessionType === 'group' && (names.length < 2 || names.length > 4)) {
    return 'Group session must have 2-4 players'
  }
  if (names.length > 4) {
    return 'Maximum 4 players per slot'
  }
  return null
}

// Resolve all player names in a /-separated string against users table
async function resolveAllPlayers(playerText) {
  if (!playerText?.trim()) return []
  const names = playerText.split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
  const players = []
  const unknown = []
  for (const name of names) {
    const user = await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
    if (user) {
      players.push(user)
    } else {
      unknown.push(name)
    }
  }
  return { players, unknown, names }
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

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { from, to, court, status, visible_only } = req.query
    let all = await db.findAll('slots')

    // Auto-confirm any past schedule_approved slots
    const today = getCairoToday()
    for (const s of all) {
      if (s.date < today && s.status === STATUS.SCHEDULE_APPROVED) {
        const sessionType = s.session_type || 'private'
        if (s.balance_status !== 'free' && s.balance_status !== 'deducted') {
          const names = (s.player_text || '').split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
          for (const name of names) {
            const user = await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
            if (user) await deductBalance(user.id, sessionType)
          }
        }
        await db.update('slots', s.id, { status: STATUS.PLAYER_CONFIRMED })
        s.status = STATUS.PLAYER_CONFIRMED
      }
    }

    if (from) all = all.filter(s => s.date >= from)
    if (to) all = all.filter(s => s.date <= to)
    if (court) all = all.filter(s => s.court === parseInt(court))
    if (status) all = all.filter(s => s.status === status)
    if (visible_only === '1') all = all.filter(s => PLAYER_VISIBLE_STATUSES.includes(s.status))
    all.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.court - b.court)

    // Enrich slots with coach name
    const coaches = await db.findAll('users', u => u.role === 'coach')
    const coachMap = new Map(coaches.map(c => [c.id, c.name]))
    const enriched = all.map(s => ({ ...s, session_type: s.session_type || 'private', coach_name: s.coach_id ? coachMap.get(s.coach_id) || null : null }))

    res.json(enriched)
  } catch (err) {
    console.error('List slots error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Court defaults — coach assigned per court (standing default)
router.get('/court-defaults', async (req, res) => {
  try {
    const defaults = await db.findAll('court_defaults')
    res.json(defaults)
  } catch (err) {
    console.error('Get court defaults error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/court-defaults', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { court, coach_id } = req.body
    if (!court) return res.status(400).json({ error: 'court is required' })
    const existing = await db.find('court_defaults', cd => cd.court === parseInt(court))
    if (existing) {
      const updated = await db.update('court_defaults', existing.id, { coach_id: coach_id || null })
      await auditUpdate(req, 'court_default', existing.id, { coach_id: existing.coach_id }, { coach_id })
      return res.json(updated)
    }
    const created = await db.insert('court_defaults', { court: parseInt(court), coach_id: coach_id || null })
    await auditCreate(req, 'court_default', created.id, { court: parseInt(court), coach_id })
    res.json(created)
  } catch (err) {
    console.error('Update court defaults error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.use(authenticate)

async function notifyUser(userId, kind, title, body, link) {
  if (!userId) return
  await db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

async function findPlayerUser(playerText) {
  if (!playerText) return null
  const name = playerText.split(/\s*\/\s*/)[0].trim()
  return await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
}

function getBalanceInfo(player) {
  if (!player) return null
  return {
    name: player.name,
    private_balance: player.private_balance || 0,
    group_balance: player.group_balance || 0,
  }
}

async function findPlayerUserById(userId) {
  if (!userId) return null
  return await db.get('users', userId)
}



// PUT /:id — generic update (admin edits slot fields)
router.put('/:id', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const slot = await db.get('slots', id)
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    const { player_text, date, time, court, session_type, status, balanceOverride, coach_id } = req.body
    const err = validateLength('Player', player_text, LIMITS.playerText)
    if (err) return res.status(400).json({ error: err })
    const newDate = date || slot.date
    const newTime = time || slot.time
    const newCourt = court || slot.court
    const conflict = await db.find('slots', s => s.id !== id && s.date === newDate && s.time === newTime && s.court === newCourt)
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
        updates.balance_status = null
      } else if (!slot.player_text?.trim() && player_text?.trim()) {
        // Admin assigning players to an empty slot
        const stype = session_type || slot.session_type || 'private'
        const resolved = await resolveAllPlayers(player_text)

        if (resolved.unknown.length > 0) {
          return res.status(400).json({ code: 'UNKNOWN_PLAYER', players: resolved.unknown })
        }

        const countErr = validatePlayerCount(resolved.names, stype)
        if (countErr) return res.status(400).json({ error: countErr })

        const isFuture = isSlotDateFutureOrToday(newDate)
        updates.status = isFuture ? STATUS.SCHEDULE_APPROVED : STATUS.PLAYER_CONFIRMED
        updates.user_id = resolved.players[0]?.id || null

        // Check all players' balances (conversion-aware)
        const insufficientPlayers = []
        for (const p of resolved.players) {
          if (!hasEnoughBalance(p, stype)) insufficientPlayers.push(p)
        }

        if (insufficientPlayers.length > 0 && !isFuture) {
          // Past slots: auto-confirm, deduct if possible
          if (balanceOverride === 'free') {
            updates.balance_status = 'free'
          } else if (balanceOverride === 'deduct') {
            for (const p of resolved.players) {
              await deductBalanceAllowNegative(p.id, stype)
            }
            updates.balance_status = 'deducted'
          } else {
            return res.status(409).json({
              code: 'INSUFFICIENT_BALANCE',
              players: insufficientPlayers.map(p => ({
                name: p.name,
                remaining: stype === 'private' ? (p.private_balance || 0) : ((p.group_balance || 0) + (p.private_balance || 0) * 2),
              })),
              sessionType: stype,
              needed: insufficientPlayers.length,
            })
          }
        } else if (insufficientPlayers.length > 0 && isFuture) {
          // Future: defer deduct to confirm, but record override
          if (balanceOverride === 'free') {
            updates.balance_status = 'free'
          } else if (balanceOverride === 'deduct') {
            updates.balance_status = 'deducted'
          } else {
            return res.status(409).json({
              code: 'INSUFFICIENT_BALANCE',
              players: insufficientPlayers.map(p => ({
                name: p.name,
                remaining: stype === 'private' ? (p.private_balance || 0) : ((p.group_balance || 0) + (p.private_balance || 0) * 2),
              })),
              sessionType: stype,
              needed: insufficientPlayers.length,
            })
          }
        } else {
          // All players have balance or override applied
          if (!isFuture && balanceOverride !== 'free') {
            for (const p of resolved.players) {
              await deductBalance(p.id, stype)
            }
          }
          if (balanceOverride === 'free') updates.balance_status = 'free'
          else if (balanceOverride === 'deduct') updates.balance_status = 'deducted'
        }

        if (isFuture) {
          for (const p of resolved.players) {
            await notifyUser(p.id, 'schedule_approved', 'Awaiting Your Confirmation',
              `A ${stype} session on ${newDate} at ${newTime} (Court ${newCourt}) has been assigned to you. Please confirm your attendance.`,
              '/profile')
          }
        }
      }
    }

    const updated = await db.update('slots', id, updates)

    if (session_type !== undefined && session_type !== slot.session_type && slot.booking_id) {
      const booking = await db.get('bookings', slot.booking_id)
      if (booking) await db.update('bookings', booking.id, { session_type })
    }

    await auditUpdate(req, 'slot', slot.id, { player_text: slot.player_text, date: slot.date, time: slot.time, court: slot.court, status: slot.status }, { player_text: updates.player_text, date: updates.date, time: updates.time, court: updates.court, status: updates.status })

    res.json(updated)
  } catch (err) {
    console.error('Update slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST / — create slot (admin manual)
router.post('/', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { date, time, court, player_text, session_type, balanceOverride, coach_id } = req.body
    if (!date || !time || !court) return res.status(400).json({ error: 'Date, time, and court are required' })
    const err = validateLength('Player', player_text, LIMITS.playerText)
    if (err) return res.status(400).json({ error: err })
    if (await db.find('slots', s => s.date === date && s.time === time && s.court === court)) return res.status(409).json({ error: 'Slot already exists' })

    const hasPlayer = player_text?.trim()
    const slotSessionType = session_type || 'private'

    if (hasPlayer) {
      const resolved = await resolveAllPlayers(player_text)
      if (resolved.unknown.length > 0) {
        return res.status(400).json({ code: 'UNKNOWN_PLAYER', players: resolved.unknown })
      }

      const countErr = validatePlayerCount(resolved.names, slotSessionType)
      if (countErr) return res.status(400).json({ error: countErr })

      // Check all players' balances (conversion-aware)
      const insufficientPlayers = []
      for (const p of resolved.players) {
        if (!hasEnoughBalance(p, slotSessionType)) insufficientPlayers.push(p)
      }

      let balanceStatus = null
      if (insufficientPlayers.length > 0) {
        if (balanceOverride === 'free') {
          balanceStatus = 'free'
        } else if (balanceOverride === 'deduct') {
          for (const p of resolved.players) {
            await deductBalanceAllowNegative(p.id, slotSessionType)
          }
          balanceStatus = 'deducted'
        } else {
          return res.status(409).json({
            code: 'INSUFFICIENT_BALANCE',
            players: insufficientPlayers.map(p => ({
              name: p.name,
              remaining: slotSessionType === 'private' ? (p.private_balance || 0) : ((p.group_balance || 0) + (p.private_balance || 0) * 2),
            })),
            sessionType: slotSessionType,
            needed: insufficientPlayers.length,
          })
        }
      } else {
        // All players have balance — deduct now
        for (const p of resolved.players) {
          await deductBalance(p.id, slotSessionType)
        }
      }

      const isFuture = isSlotDateFutureOrToday(date)
      const slot = await db.insert('slots', {
        date, time, court, player_text,
        session_type: slotSessionType,
        coach_id: coach_id || null,
        status: isFuture ? STATUS.SCHEDULE_APPROVED : STATUS.PLAYER_CONFIRMED,
        booking_id: null,
        user_id: resolved.players[0]?.id || null,
        balance_status: balanceStatus,
      })

      // Notify players for future/today slots (past slots are auto-confirmed, no notification)
      if (isFuture) {
        for (const p of resolved.players) {
          await notifyUser(p.id, 'schedule_approved', 'Awaiting Your Confirmation',
            `A ${slotSessionType} session on ${date} at ${time} (Court ${court}) has been assigned to you. Please confirm your attendance.`,
            '/profile')
        }
      }

      await auditCreate(req, 'slot', slot.id, { date, time, court, player_text, session_type: slotSessionType, status: slot.status })

      return res.status(201).json(slot)
    }

    const slot = await db.insert('slots', { date, time, court, player_text: player_text || '', session_type: hasPlayer ? slotSessionType : null, coach_id: coach_id || null, status: STATUS.AVAILABLE, booking_id: null })
    await auditCreate(req, 'slot', slot.id, { date, time, court, player_text, session_type: slotSessionType, status: STATUS.AVAILABLE })
    res.status(201).json(slot)
  } catch (err) {
    console.error('Create slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id
router.delete('/:id', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    await db.remove('slots', parseInt(req.params.id))
    await auditDelete(req, 'slot', slot.id, { date: slot.date, time: slot.time, court: slot.court, player_text: slot.player_text, status: slot.status })
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/approve — old approve for pending (now only for payment_approved → schedule_approved per-slot)
router.put('/:id/approve', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.PAYMENT_APPROVED) return res.status(400).json({ error: 'Slot must be payment_approved to approve' })

    const updated = await db.update('slots', slot.id, { status: STATUS.SCHEDULE_APPROVED })

    const player = slot.user_id ? await findPlayerUserById(slot.user_id) : await findPlayerUser(slot.player_text)
    if (player) {
      await notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
        `Your ${slot.session_type || 'session'} on ${slot.date} at ${slot.time} (Court ${slot.court}) has been approved by admin. Please confirm your attendance.`,
        '/profile')
    }

    await auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: STATUS.SCHEDULE_APPROVED })

    res.json(updated)
  } catch (err) {
    console.error('Approve slot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/toggle-type
router.put('/:id/toggle-type', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (!slot.player_text || !slot.player_text.trim()) return res.status(400).json({ error: 'Empty slot has no type' })

    const newType = slot.session_type === 'private' ? 'group' : 'private'

    // Validate player count against new type
    const names = slot.player_text.split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
    const countErr = validatePlayerCount(names, newType)
    if (countErr) return res.status(400).json({ error: countErr })

    const updated = await db.update('slots', slot.id, { session_type: newType })

    const player = slot.user_id ? await findPlayerUserById(slot.user_id) : await findPlayerUser(slot.player_text)
    if (player) {
      await notifyUser(player.id, 'type_changed', 'Session Type Updated',
        `Your session on ${slot.date} at ${slot.time} (Court ${slot.court}) has been changed to ${newType}.`,
        '/schedule')
    }

    await auditUpdate(req, 'slot', slot.id, { session_type: slot.session_type }, { session_type: newType })

    res.json(updated)
  } catch (err) {
    console.error('Toggle type error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/confirm — player confirms attendance (schedule_approved → player_confirmed)
router.put('/:id/confirm', async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.SCHEDULE_APPROVED) return res.status(400).json({ error: 'Slot must be schedule_approved' })

    // Verify the player owns this slot
    if (slot.user_id && slot.user_id !== req.user.id && req.user.role === 'player') {
      return res.status(403).json({ error: 'Not your slot' })
    }

    const sessionType = slot.session_type || 'private'
    const bStatus = slot.balance_status

    // If balance already handled at creation (free/deducted), skip deduct on confirm
    if (bStatus === 'free' || bStatus === 'deducted') {
      const updated = await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
      await auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: STATUS.PLAYER_CONFIRMED })
      if (slot.user_id) {
        await notifyUser(slot.user_id, 'player_confirmed', 'Attendance Confirmed',
          `Your ${sessionType} session on ${slot.date} at ${slot.time} (Court ${slot.court}) is confirmed.`,
          '/schedule')
      }
      return res.json(updated)
    }

    // Normal path: deduct all players in player_text
    const names = (slot.player_text || '').split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
    const players = []
    for (const name of names) {
      const user = await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
      if (user) players.push(user)
    }

    let updated
    if (players.length > 0) {
      // Deduct all (conversion-aware; silently skips if insufficient — confirmation is never blocked)
      for (const p of players) {
        await deductBalance(p.id, sessionType)
      }
      updated = await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
    } else {
      updated = await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
    }

    await auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: STATUS.PLAYER_CONFIRMED })

    if (slot.user_id) {
      await notifyUser(slot.user_id, 'player_confirmed', 'Attendance Confirmed',
        `Your ${sessionType} session on ${slot.date} at ${slot.time} (Court ${slot.court}) is confirmed.`,
        '/schedule')
    }

    res.json(updated)
  } catch (err) {
    console.error('Player confirm error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/decline — player declines, creates cancel request (schedule_approved → cancel request)
router.put('/:id/decline', async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    if (slot.status !== STATUS.SCHEDULE_APPROVED) return res.status(400).json({ error: 'Slot must be schedule_approved' })

    if (slot.user_id && slot.user_id !== req.user.id && req.user.role === 'player') {
      return res.status(403).json({ error: 'Not your slot' })
    }

    // Create a cancel request routed to admin
    const request = await db.insert('booking_requests', {
      kind: 'cancel',
      slot_id: slot.id,
      booking_id: slot.booking_id || null,
      player_id: req.user.id,
      player_name: req.user.name,
      payload: { date: slot.date, time: slot.time, court: slot.court },
      status: 'pending',
    })

    const admins = await db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
    for (const admin of admins) {
      await notifyUser(admin.id, 'request_cancel',
        'Cancellation Requested',
        `${req.user.name} wants to cancel their slot on ${slot.date} at ${slot.time} (Court ${slot.court}).`,
        '/admin/bookings')
    }

    res.json({ ok: true, message: 'Cancellation request submitted to admin', request })
    await auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: slot.status, decline_request: request.id })
  } catch (err) {
    console.error('Player decline error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id/mark-attended — admin forces schedule_approved → player_confirmed (retroactive deduction)
router.put('/:id/mark-attended', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const slot = await db.get('slots', parseInt(req.params.id))
    if (!slot) return res.status(404).json({ error: 'Slot not found' })

    // Can mark attended on schedule_approved or even payment_approved (player showed up without going through flow)
    if (![STATUS.SCHEDULE_APPROVED, STATUS.PAYMENT_APPROVED, STATUS.PAYMENT_PENDING].includes(slot.status)) {
      return res.status(400).json({ error: 'Slot cannot be mark-attended from current status' })
    }

    const sessionType = slot.session_type || 'private'
    const bStatus = slot.balance_status
    let updated

    // If balance already handled at creation, skip deduct
    if (bStatus === 'free' || bStatus === 'deducted') {
      updated = await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
    } else {
      // Deduct all players
      const names = (slot.player_text || '').split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
      const players = []
      for (const name of names) {
        const user = await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
        if (user) players.push(user)
      }

      if (players.length > 0) {
        for (const p of players) {
          await deductBalance(p.id, sessionType)
        }
      }
      updated = await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
    }

    await auditUpdate(req, 'slot', slot.id, { status: slot.status }, { status: STATUS.PLAYER_CONFIRMED })

    if (slot.user_id) {
      await notifyUser(slot.user_id, 'mark_attended', 'Session Marked Attended',
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
router.put('/day/:date/approve', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { date } = req.params
    const slots = await db.findAll('slots', s => s.date === date && s.status === STATUS.PAYMENT_APPROVED)
    if (slots.length === 0) return res.json({ approved: 0, message: 'No payment_approved slots for this date' })

    let count = 0
    for (const slot of slots) {
      await db.update('slots', slot.id, { status: STATUS.SCHEDULE_APPROVED })
      count++

      const player = slot.user_id ? await findPlayerUserById(slot.user_id) : await findPlayerUser(slot.player_text)
      if (player) {
        await notifyUser(player.id, 'schedule_approved', 'Awaiting Your Confirmation',
          `Your ${slot.session_type || 'session'} on ${slot.date} at ${slot.time} (Court ${slot.court}) is approved. Please confirm your attendance.`,
          '/profile')
      }
    }
    await auditUpdate(req, 'slots', null, { date, count: slots.length }, { date, action: 'day_approve', count })

    res.json({ approved: count })
  } catch (err) {
    console.error('Approve day error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /day/:date/undo — batch revert schedule_approved slots on a date → payment_approved
router.put('/day/:date/undo', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { date } = req.params
    const slots = await db.findAll('slots', s => s.date === date && s.status === STATUS.SCHEDULE_APPROVED)
    if (slots.length === 0) return res.json({ reverted: 0, message: 'No schedule_approved slots for this date' })

    let count = 0
    for (const slot of slots) {
      await db.update('slots', slot.id, { status: STATUS.PAYMENT_APPROVED })
      count++

      const player = slot.user_id ? await findPlayerUserById(slot.user_id) : await findPlayerUser(slot.player_text)
      if (player) {
        await notifyUser(player.id, 'day_approval_reverted', 'Schedule Approval Reverted',
          `The schedule approval for ${slot.date} at ${slot.time} (Court ${slot.court}) has been reverted. You no longer need to confirm this slot.`,
          '/schedule')
      }
    }
    await auditUpdate(req, 'slots', null, { date, count: slots.length }, { date, action: 'day_undo', count })

    res.json({ reverted: count })
  } catch (err) {
    console.error('Undo day approval error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /auto-confirm-past — auto-confirm all schedule_approved slots with dates before today
router.put('/auto-confirm-past', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const today = getCairoToday()
    const slots = await db.findAll('slots', s => s.date < today && s.status === STATUS.SCHEDULE_APPROVED)
    if (slots.length === 0) return res.json({ confirmed: 0, message: 'No past schedule_approved slots' })

    let count = 0
    for (const slot of slots) {
      const sessionType = slot.session_type || 'private'
      const bStatus = slot.balance_status

      // Deduct if not already handled
      if (bStatus !== 'free' && bStatus !== 'deducted') {
        const names = (slot.player_text || '').split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
        for (const name of names) {
          const user = await db.find('users', u => u.role === 'player' && u.name && u.name.toLowerCase() === name.toLowerCase())
          if (user) await deductBalance(user.id, sessionType)
        }
      }

      await db.update('slots', slot.id, { status: STATUS.PLAYER_CONFIRMED })
      count++
    }

    await auditUpdate(req, 'slots', null, { action: 'auto_confirm_past', count }, { action: 'auto_confirm_past', count })

    res.json({ confirmed: count })
  } catch (err) {
    console.error('Auto-confirm past error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
