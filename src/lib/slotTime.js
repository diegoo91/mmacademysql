// Time helpers for the schedule: slots are hourly, a slot stored as '17:00'
// runs to 18:00, imported slots may carry a range '17:00-18:00'.
export const ALL_TIMES = ['14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00']

const DAY_START = 14 * 60
const DAY_END = 24 * 60

export const timeToMin = (t) => {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export const slotEndMin = (t) => {
  const s = String(t || '')
  const range = s.split('-')
  if (range.length === 2) {
    const end = timeToMin(range[1])
    if (end != null) return end
  }
  const start = timeToMin(s)
  return start == null ? null : start + 60
}

export const minToTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const canonStart = (t) => String(t || '').split('-')[0]

/**
 * Next free hour for a new slot: the later of
 *   1) the end of the last slot on that COURT that date, and
 *   2) the end of the last slot of that COACH that date (any court),
 * so the slot lands right after the existing schedule and never double-books
 * the court or the coach. Cancelled/denied slots freed their hour.
 * Returns null when there is no room left in the day.
 */
export function suggestNextSlotTime({ date, court, coachId, slots = [] }) {
  if (!date || !court) return null
  const live = slots.filter(s => s.status !== 'cancelled' && s.status !== 'denied')
  const coachIdNum = coachId != null && coachId !== '' ? Number(coachId) : null

  let end = null
  for (const s of live) {
    if (s.date !== date) continue
    const sameCourt = Number(s.court) === Number(court)
    const sameCoach = coachIdNum != null && Number(s.coach_id) === coachIdNum
    if (!sameCourt && !sameCoach) continue
    const e = slotEndMin(s.time)
    if (e != null && (end == null || e > end)) end = e
  }
  if (end == null) return null
  if (end < DAY_START) end = DAY_START
  if (end > DAY_END) return null

  const blocked = (t) => live.some(s =>
    s.date === date &&
    (Number(s.court) === Number(court) ||
      (coachIdNum != null && Number(s.coach_id) === coachIdNum)) &&
    canonStart(s.time) === t)

  while (end <= DAY_END) {
    const t = minToTime(end)
    if (ALL_TIMES.includes(t) && !blocked(t)) return t
    end += 60
  }
  return null
}
