/**
 * PROD (Supabase) — READ-ONLY: Court Coach Defaults sanity check.
 * Shows the defaults per court and, for the latest scheduled day, what the
 * Add Slot auto-hour would suggest for each court (court end vs coach end).
 * Uses the real frontend helper (src/lib/slotTime.js) — pure functions.
 */
import 'dotenv/config'
process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
const { suggestNextSlotTime } = await import('file:///D:/SQL/mm-padel-academy%20mysql/src/lib/slotTime.js')
const { default: db } = await import('./src/db.js')

const defaults = await db.findAll('court_defaults')
const users = await db.findAll('users')
const coachName = (id) => users.find(u => u.id === id)?.name || null
console.log('court_defaults:', defaults.map(d => ({ court: d.court, coach_id: d.coach_id, coach: coachName(d.coach_id) })))

const slots = await db.findAll('slots')
const dates = [...new Set(slots.map(s => s.date))].sort()
const latest = dates[dates.length - 1]
const day = slots.filter(s => s.date === latest)
console.log(`latest scheduled day: ${latest} (${day.length} slots)`)
const byCourt = {}
for (const s of day) {
  const k = `court${s.court}`
  byCourt[k] = byCourt[k] || []
  byCourt[k].push(`${s.time}${s.coach_id ? ' #' + coachName(s.coach_id) : ''} [${s.status}]`)
}
console.log(byCourt)

for (const d of defaults) {
  const suggestion = suggestNextSlotTime({ date: latest, court: d.court, coachId: d.coach_id, slots })
  const coachEnd = day.filter(s => Number(s.coach_id) === Number(d.coach_id) && s.status !== 'cancelled' && s.status !== 'denied')
    .map(s => s.time).sort().pop() || 'none'
  const courtEnd = day.filter(s => Number(s.court) === Number(d.court) && s.status !== 'cancelled' && s.status !== 'denied')
    .map(s => s.time).sort().pop() || 'none'
  console.log(`Court ${d.court} (default ${coachName(d.coach_id)}): last court slot=${courtEnd}, last coach slot=${coachEnd} -> next slot time = ${suggestion ?? 'no room / empty day'}`)
}
process.exit(0)
