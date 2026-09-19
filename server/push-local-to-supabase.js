import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import knex from 'knex'

const __dirname = dirname(fileURLToPath(import.meta.url))

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  },
})

const PG_MAP = { users: { id: 'user_id' } }

function appToPg(table, obj) {
  const map = PG_MAP[table]
  if (!map) return obj
  const out = { ...obj }
  for (const [appCol, pgCol] of Object.entries(map)) {
    if (appCol in out) { out[pgCol] = out[appCol]; delete out[appCol] }
  }
  return out
}

const BOOL_TO_INT = ['is_claimed', 'force_password_change']
const STRING_TO_NULL = ['dob', 'phone', 'notes', 'position', 'avatar', 'user_code', 'balance_zero_since', 'skill_level', 'dob']

function cleanRow(table, row) {
  let mapped = appToPg(table, { ...row })
  delete mapped.id
  delete mapped.created_at
  delete mapped.updated_at
  for (const col of BOOL_TO_INT) {
    if (col in mapped) mapped[col] = mapped[col] ? 1 : 0
  }
  for (const [k, v] of Object.entries(mapped)) {
    if (v === undefined) delete mapped[k]
  }
  return mapped
}

async function migrate() {
  console.log('Connected to Supabase...')

  const jsonPath = join(__dirname, 'data', 'academy.db.json')
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'))

  const collections = [
    'users', 'slots', 'bookings', 'results', 'import_batches',
    'comments', 'notifications', 'conversion_requests', 'expenses',
    'booking_requests', 'payments', 'audit_logs', 'court_defaults'
  ]

  for (const table of collections) {
    const rows = data[table] || []
    if (rows.length === 0) {
      console.log(`${table}: 0 rows, skipping`)
      continue
    }
    const cleaned = rows.map(r => cleanRow(table, r))
    const batchSize = 50
    let inserted = 0
    for (let i = 0; i < cleaned.length; i += batchSize) {
      const batch = cleaned.slice(i, i + batchSize)
      try {
        await db(table).insert(batch)
        inserted += batch.length
      } catch (err) {
        console.error(`${table} batch error:`, err.message)
        for (const row of batch) {
          try {
            await db(table).insert(row)
            inserted++
          } catch (e) {
            console.error(`  Skipped row in ${table}:`, e.message)
          }
        }
      }
    }
    console.log(`${table}: inserted ${inserted}/${rows.length}`)
  }

  // Reset sequences
  for (const table of collections) {
    try {
      const pk = table === 'users' ? 'user_id' : 'id'
      const max = await db(table).max(`${pk} as m`).first()
      if (max && max.m) {
        await db.raw(`SELECT setval(pg_get_serial_sequence('${table}', '${pk}'), ${max.m})`)
      }
    } catch {}
  }
  console.log('Sequences reset')

  await db.destroy()
  console.log('Migration complete!')
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
