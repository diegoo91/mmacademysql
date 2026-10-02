import 'dotenv/config'
process.env.DB_ENABLED = 'true'
const { default: db } = await import('./src/db.js')
console.log('backend =', db.backend, '| DATABASE_URL set =', Boolean(process.env.DATABASE_URL))
const rows = await db.findAll('coach_daily_hours')
for (const r of rows) console.log(`  #${r.id} c${r.coach_id} ${r.date} ${r.hours}h ${r.notes ?? ''}`)
const bal = {}
for (const r of rows) bal[r.coach_id] = (bal[r.coach_id] || 0) + Number(r.hours)
console.log('totals:', JSON.stringify(bal))
await db.close?.()
process.exit(0)
