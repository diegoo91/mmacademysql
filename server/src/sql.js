// PostgreSQL connection (Knex + pg). Local-only for now — production keeps JSON.
// Enable with: DB_ENABLED=true (+ DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD).
// NOTE: never commit real credentials; see server/.env.example.
import knexLib from 'knex'

export const DB_ENABLED = process.env.DB_ENABLED === 'true'

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'mmacademy',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
}

let instance = null

export function getKnex() {
  if (!instance) {
    instance = knexLib({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || dbConfig.host,
        port: Number(process.env.DB_PORT || dbConfig.port),
        database: process.env.DB_NAME || dbConfig.database,
        user: process.env.DB_USER || dbConfig.user,
        password: process.env.DB_PASSWORD ?? dbConfig.password,
      },
      pool: { min: 0, max: Number(process.env.DB_CONNECTION_LIMIT || dbConfig.connectionLimit) },
    })
  }
  return instance
}

export async function checkSqlConnection() {
  const k = getKnex()
  const [{ version }] = await k.raw('SELECT version()')
  return version || 'unknown'
}

// Timestamp in the legacy JSON format: 'YYYY-MM-DD HH:MM:SS'.
// Used by both backends so row output stays identical.
export function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function stamp(record, isNew = true) {
  const out = { ...record }
  if (isNew && out.created_at === undefined) out.created_at = now()
  out.updated_at = now()
  return out
}
