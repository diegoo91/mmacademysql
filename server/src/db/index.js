// Backend switch: JSON file (default) vs MySQL (knex).
// Usage in routes/middleware: `import db from '../db/index.js'`
// (or '../../db/index.js' from deeper paths — fix the relative path per file).
// With DB_BACKEND=json (default) this re-exports the existing sync JSON API,
// so Phase 0/1 changes nothing at runtime. With DB_BACKEND=mysql it exports
// the async MySQL adapter — callers must await (Phase 2/3 route rewrites).
import jsonDb from '../database.js'
import { isMysqlEnabled } from './connection.js'
import { createMysqlDb } from './mysql-adapter.js'

let mysqlDb = null

function getDb() {
  if (isMysqlEnabled()) {
    if (!mysqlDb) mysqlDb = createMysqlDb()
    return mysqlDb
  }
  return jsonDb
}

// Default export keeps `import db from '../db/index.js'` working.
// Note: with mysql this is the async adapter (await every call).
const db = new Proxy({}, {
  get(_t, prop) {
    const target = getDb()
    const v = target[prop]
    if (typeof v === 'function') return v.bind(target)
    return v
  },
})

export default db
export { isMysqlEnabled }
