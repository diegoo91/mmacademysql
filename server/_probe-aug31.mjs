import 'dotenv/config'
process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
const { default: db } = await import('./src/db.js')
const slots = await db.findAll('slots')
const dates = slots.map(s => s.date).filter(Boolean).sort()
console.log('total slots:', slots.length)
console.log('min date:', dates[0], ' max date:', dates[dates.length - 1])
const byDate = {}
for (const s of slots) byDate[s.date] = (byDate[s.date] || 0) + 1
console.log('--- around 31/8 ---')
for (const d of ['2026-08-25','2026-08-28','2026-08-29','2026-08-30','2026-08-31','2026-09-01','2026-09-02']) {
  console.log(d, '->', byDate[d] || 0)
}
const aug31 = slots.filter(s => s.date === '2026-08-31')
console.log('--- 2026-08-31 slots (' + aug31.length + ') ---')
for (const s of aug31) console.log('  slot#'+s.id, s.time, 'court'+s.court, s.session_type, 'status='+s.status, JSON.stringify(s.player_text))
console.log('--- any date containing 08-31 in other formats? unique raw sample ---')
console.log([...new Set(slots.map(s => s.date))].filter(d => d && d.includes('-08-')).slice(0, 40))
await db.close?.()
