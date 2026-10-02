// Coach availability — admin-managed weekly hours + date-specific days off.
//   GET    /                      all coaches with their rules (schedule viewers)
//   PUT    /:coachId              replace weekly windows (admins only)
//   POST   /:coachId/dates        add a day off (admins only)
//   DELETE /dates/:id             remove a day off (admins only)
//
// Empty weekly list = coach is unrestricted (backward compatible).

import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole, requirePermission } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const byWeekday = (a, b) => Number(a.weekday) - Number(b.weekday)
const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date))

async function getCoach(id) {
  const coach = await db.get('users', Number(id))
  return coach && coach.role === 'coach' ? coach : null
}

async function serializeCoach(coach, weekly, dates) {
  return {
    id: coach.id,
    name: coach.name,
    email: coach.email || null,
    account_status: coach.account_status || 'active',
    weekly: weekly.filter(a => a.coach_id === coach.id).sort(byWeekday)
      .map(w => ({ id: w.id, weekday: Number(w.weekday), start_time: w.start_time, end_time: w.end_time })),
    dates: dates.filter(d => d.coach_id === coach.id).sort(byDateDesc)
      .map(d => ({ id: d.id, date: String(d.date).slice(0, 10), note: d.note || null })),
  }
}

// GET / — every coach + their availability (admins/coaches with schedule view)
router.get('/', requirePermission('schedule'), async (req, res) => {
  try {
    const coaches = await db.findAll('users', u => u.role === 'coach')
    const weekly = await db.findAll('coach_availability')
    const dates = await db.findAll('coach_unavailable_dates')
    const out = []
    for (const c of coaches) out.push(await serializeCoach(c, weekly, dates))
    res.json({ coaches: out })
  } catch (err) {
    console.error('List coach availability error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:coachId — replace weekly windows (admins only)
router.put('/:coachId', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const coach = await getCoach(req.params.coachId)
    if (!coach) return res.status(404).json({ error: 'Coach not found' })

    const { weekly } = req.body
    if (!Array.isArray(weekly)) return res.status(400).json({ error: 'weekly must be an array' })

    const clean = []
    const seen = new Set()
    for (const w of weekly) {
      const weekday = Number(w?.weekday)
      const start = String(w?.start_time || '')
      const end = String(w?.end_time || '')
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return res.status(400).json({ error: 'weekday must be an integer between 0 (Sunday) and 6' })
      }
      if (seen.has(weekday)) return res.status(400).json({ error: `weekday ${weekday} appears more than once` })
      if (!HHMM.test(start) || !HHMM.test(end)) {
        return res.status(400).json({ error: 'start_time and end_time must be HH:MM' })
      }
      if (end <= start) return res.status(400).json({ error: `end_time must be after start_time (${start}–${end})` })
      seen.add(weekday)
      clean.push({ weekday, start_time: start, end_time: end })
    }

    const existing = await db.findAll('coach_availability', a => a.coach_id === coach.id)
    for (const row of existing) await db.remove('coach_availability', row.id)
    for (const w of clean) await db.insert('coach_availability', { coach_id: coach.id, ...w })

    const weeklyAfter = await db.findAll('coach_availability', a => a.coach_id === coach.id)
    const datesAfter = await db.findAll('coach_unavailable_dates', d => d.coach_id === coach.id)
    res.json(await serializeCoach(coach, weeklyAfter, datesAfter))
  } catch (err) {
    console.error('Update coach availability error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /:coachId/dates — add a day off (admins only)
router.post('/:coachId/dates', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const coach = await getCoach(req.params.coachId)
    if (!coach) return res.status(404).json({ error: 'Coach not found' })

    const date = String(req.body?.date || '')
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : null
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }
    const dup = await db.find('coach_unavailable_dates', d => d.coach_id === coach.id && String(d.date).slice(0, 10) === date)
    if (dup) return res.status(409).json({ error: 'That date is already marked off for this coach' })

    let row
    try {
      row = await db.insert('coach_unavailable_dates', { coach_id: coach.id, date, note })
    } catch (e) {
      // unique (coach_id, date) race → same 409 as the dup pre-check
      if (/uq_coach_date|duplicate key/i.test(String(e?.message || e))) {
        return res.status(409).json({ error: 'That date is already marked off for this coach' })
      }
      throw e
    }
    res.status(201).json({ id: row.id, date, note })
  } catch (err) {
    console.error('Add coach day off error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /dates/:id — remove a day off (admins only)
router.delete('/dates/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const row = await db.get('coach_unavailable_dates', Number(req.params.id))
    if (!row) return res.status(404).json({ error: 'Date entry not found' })
    await db.remove('coach_unavailable_dates', row.id)
    res.json({ ok: true, id: row.id })
  } catch (err) {
    console.error('Remove coach day off error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
