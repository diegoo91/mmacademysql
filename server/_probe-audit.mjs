import 'dotenv/config'
process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
const { default: db } = await import('./src/db.js')
const logs = await db.findAll('audit_logs')
console.log('audit_logs total:', logs.length)
const hit = logs.filter(l => JSON.stringify(l).includes('341') || JSON.stringify(l).toLowerCase().includes('farida') || JSON.stringify(l).match(/"49"/))
for (const l of hit.slice(-25)) console.log(JSON.stringify(l))
await db.close?.()
