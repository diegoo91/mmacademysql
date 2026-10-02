/** READ-ONLY preflight: coach ids + existing coach_daily_hours rows for target dates. */
import 'dotenv/config'
process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { default: db } = await import('./src/db.js')

const DATES = ['2026-09-26', '2026-09-27', '2026-09-29', '2026-09-30']

const users = await db.findAll('users')
console.log('--- coaches ---')
for (const u of users.filter(u => (u.role || '').toLowerCase().includes('coach'))) {
  console.log(`  id=${u.id} name=${u.name} role=${u.role}`)
}

const all = await db.findAll('coach_daily_hours')
console.log(`--- coach_daily_hours total rows: ${all.length} ---`)
console.log('--- rows for target dates ---')
const hits = all
  .filter(h => DATES.includes(h.date))
  .sort((a, b) => (a.date + a.coach_id).localeCompare(b.date + b.coach_id))
if (!hits.length) console.log('  (none)')
for (const h of hits) {
  const c = users.find(u => u.id === h.coach_id)
  console.log(`  #${h.id} coach=${h.coach_id}(${c?.name}) date=${h.date} hours=${h.hours} notes=${h.notes ?? '-'} source=${h.source ?? '-'} created=${h.created_at}`)
}
console.log('--- all rows Sep 20 - Sep 30 ---')
for (const h of all.filter(h => h.date >= '2026-09-20' && h.date <= '2026-09-30').sort((a, b) => (a.date + a.coach_id).localeCompare(b.date + b.coach_id))) {
  const c = users.find(u => u.id === h.coach_id)
  console.log(`  #${h.id} coach=${h.coach_id}(${c?.name}) date=${h.date} hours=${h.hours} notes=${h.notes ?? '-'}`)
}
await db.close?.()
