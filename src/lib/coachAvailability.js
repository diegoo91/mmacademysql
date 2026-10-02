// Client-side mirror of server/src/utils/coachAvailability.js — used for live
// hints under the Coach select and for red-flagging existing schedule slots.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// 'YYYY-MM-DD' → 0=Sunday … 6=Saturday
export function weekdayIndex(dateStr) {
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`).getUTCDay()
}

// '19:00' | '15:00-16:00' → { startM, endM } minutes, overnight wrap handled
export function slotRange(time) {
  const s = String(time || '')
  const start = s.slice(0, 5)
  if (!HHMM.test(start)) return null
  let endStr = s.length >= 11 ? s.slice(6, 11) : ''
  if (!HHMM.test(endStr)) {
    endStr = `${String((Number(start.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${start.slice(3, 5)}`
  }
  const startM = toMin(start)
  let endM = toMin(endStr)
  if (endM <= startM) endM += 24 * 60
  return { startM, endM }
}

const overlaps = (a, b) => Boolean(a && b && a.startM < b.endM && a.endM > b.startM)

/**
 * Issue message for one prospective assignment, or null when fine.
 * availability: { coaches: [{ id, name, weekly, dates }] }
 * target: { coach_id, date, time, excludeId? }
 */
export function issueFor(availability, slots, target) {
  const { coach_id, date, time, excludeId } = target || {}
  if (!coach_id || !date || !time) return null
  const coach = availability?.coaches?.find(c => Number(c.id) === Number(coach_id))
  if (!coach) return null

  const d = String(date).slice(0, 10)
  const off = (coach.dates || []).find(x => x.date === d)
  if (off) return `${coach.name} is off on ${d}${off.note ? ` (${off.note})` : ''}`

  const range = slotRange(time)
  if (!range) return null

  if ((coach.weekly || []).length > 0) {
    const wd = weekdayIndex(d)
    const wins = coach.weekly.filter(w => Number(w.weekday) === wd)
    const inside = wins.some(w => overlaps(range, { startM: toMin(w.start_time), endM: toMin(w.end_time) }))
    if (!inside) {
      const label = DAY_LABELS[wd]
      return wins.length > 0
        ? `${coach.name} works ${wins.map(w => `${w.start_time}\u2013${w.end_time}`).join(', ')} on ${label}s`
        : `${coach.name} doesn't work on ${label}s`
    }
  }

  const conflict = (slots || []).find(s =>
    Number(s.id) !== Number(excludeId) &&
    Number(s.coach_id) === Number(coach_id) &&
    String(s.date).slice(0, 10) === d &&
    Boolean(s.player_text && s.player_text.trim()) &&
    overlaps(range, slotRange(s.time)))
  if (conflict) return `${coach.name} is already on Court ${conflict.court} at ${conflict.time}`

  return null
}
