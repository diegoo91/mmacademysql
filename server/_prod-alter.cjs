/** Production DDL (approved): add users.permissions. Idempotent + verified. */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = 'D:/SQL/mm-padel-academy mysql'
function parseEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
;(async () => {
  const c = new Client({
    host: u.hostname, port: Number(u.port) || 6543,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
  })
  await c.connect()
  try {
    const before = await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='permissions'")
    console.log('before: permissions column exists =', before.rowCount === 1)
    const r = await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB')
    console.log('ALTER:', r.command ?? 'ok')
    const after = await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='permissions'")
    console.log('after: exists =', after.rowCount === 1, 'type =', after.rows[0]?.data_type)
    if (after.rowCount !== 1) process.exit(1)
    console.log('PROD ALTER VERIFIED')
  } finally {
    await c.end()
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
