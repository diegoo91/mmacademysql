// Knex config for mmacademy (MySQL 8, InnoDB, utf8mb4).
// Env vars (never paste values in chat):
//   DB_HOST (localhost), DB_PORT (5175), DB_NAME (mmacademy), DB_USER, DB_PASSWORD
//   Optional: DATABASE_URL or MYSQL_URL (Railway add-on) overrides the parts above.
//   DB_BACKEND=json|mysql — routes default to json until cutover.
import 'dotenv/config'

function fromUrl(url) {
  try {
    const u = new URL(url)
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    }
  } catch { return {} }
}

const urlOverride = process.env.DATABASE_URL || process.env.MYSQL_URL
const urlParts = urlOverride ? fromUrl(urlOverride) : {}

const connection = {
  host: process.env.DB_HOST || urlParts.host || 'localhost',
  port: Number(process.env.DB_PORT || urlParts.port || 5175),
  user: process.env.DB_USER || urlParts.user || 'root',
  password: process.env.DB_PASSWORD ?? urlParts.password ?? '',
  database: process.env.DB_NAME || urlParts.database || 'mmacademy',
}

const config = {
  client: 'mysql2',
  connection,
  pool: { min: 2, max: 10 },
  migrations: { directory: './migrations', extension: 'js' },
}

export default config
