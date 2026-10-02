// Coach availability checks — shared by slot create/update routes.
//
// Semantics (see docs/coach-availability-plan.md):
//   - coach_unavailable_dates always applies (explicit day off).
//   - coach_availability (weekly windows): if the coach has rows, only the
//     listed windows are available (unlisted weekdays are off); if the coach
//     has no rows, any time is allowed (backward compatible).
//   - A slot's time range must overlap a working window.
//   - Conflict: the same coach is on another slot on the same date with an
//     overlapping time AND a player booked on it.
//
// All checks return { ok: true } or { ok: false, code, message, details }.

import db from '../db.js'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

// '19:00' | '15:00-16:00' | '10:00-12:00' → { start, end } as minutes
export function slotRange(time) {
  const s = String(time || '')
  const start = s.slice(0, 5)
  if (!HHMM.test(start)) return null
  let endStr = s.length >= 11 ? s.slice(6, 11) : ''
  if (!HHMM.test(endStr)) {
    // Single-hour slot: end = start + 1h (23:00 → 24:00, wrap handled below)
    const h = Number(start.slice(0, 2))
    endStr = `${String((h + 1) % 24).padStart(2, '0')}:${start.slice(3, 5)}`
  }
  let startM = toMin(start)
  let endM = toMin(endStr)
  if (endM <= startM) endM += 24 * 60 // overnight wrap (e.g. 23:00-00:00)
  return { startM, endM }
}

// 'YYYY-MM-DD' → 0=Sunday … 6=Saturday (UTC-safe: no local TZ shift)
export function weekdayIndex(dateStr) {
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`).getUTCDay()
}

const overlaps = (a, b) => a.startM < b.endM && a.endM > b.startM

export async function checkCoachSlot({ coach_id, date, time, excludeSlotId = null }) {
  if (!coach_id) return { ok: true }

  const coach = await db.get('users', Number(coach_id))
  if (!coach || coach.role !== 'coach') return { ok: true } // not our concern; FK handles validity

  const dateStr = String(date).slice(0, 10)
  const dayOff = await db.find('coach_unavailable_dates', d =>
    d.coach_id === Number(coach_id) && String(d.date).slice(0, 10) === dateStr)
  if (dayOff) {
    return {
      ok: false,
      code: 'COACH_UNAVAILABLE',
      message: `${coach.name} is off on ${dateStr}${dayOff.note ? ` (${dayOff.note})` : ''}`,
      details: { reason: 'day_off', coachName: coach.name, date, time, note: dayOff.note || null },
    }
  }

  const range = slotRange(time)
  if (!range) return { ok: true } // unknown time format — don't block

  const weekly = await db.findAll('coach_availability', a => a.coach_id === Number(coach_id))
  if (weekly.length > 0) {
    const wd = weekdayIndex(date)
    const windows = weekly.filter(w => Number(w.weekday) === wd)
    const inside = windows.some(w => overlaps(range, { startM: toMin(w.start_time), endM: toMin(w.end_time) }))
    if (!inside) {
      const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd]
      const hours = windows.length
        ? windows.map(w => `${w.start_time}–${w.end_time}`).join(', ')
        : 'no working hours'
      return {
        ok: false,
        code: 'COACH_UNAVAILABLE',
        message: `${coach.name} is not available on ${label} ${String(date).slice(0, 10)} at ${time} (works ${hours})`,
        details: {
          reason: hours === 'no working hours' ? 'not_working_day' : 'outside_hours',
          coachName: coach.name, date, time, weekday: wd, windows,
        },
      }
    }
  }

  const conflict = await db.find('slots', s =>
    s.id !== excludeSlotId &&
    s.coach_id === Number(coach_id) &&
    String(s.date).slice(0, 10) === String(date).slice(0, 10) &&
    Boolean(s.player_text && s.player_text.trim()) &&
    overlaps(range, slotRange(s.time)))
  if (conflict) {
    return {
      ok: false,
      code: 'COACH_CONFLICT',
      message: `${coach.name} is already on Court ${conflict.court} at ${conflict.time} on ${String(date).slice(0, 10)}`,
      details: {
        coachName: coach.name,
        conflict: { id: conflict.id, date: String(conflict.date).slice(0, 10), time: conflict.time, court: conflict.court },
      },
    }
  }

  return { ok: true }
}
