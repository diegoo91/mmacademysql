// MySQL adapter exposing the same method names as server/src/database.js
// (get/find/findAll/query/insert/update/remove/count/sum/insertBatch/upsert/
// transaction/clear/replace) so route diffs stay small.
//
// Column truth (per approved plan — code matches DB, API stays stable):
//   users PK = user_id (API keeps `id` via alias: row.id = row.user_id)
//   notifications.is_read (API keeps `read`)
//   audit_logs.rec_before (API keeps `before`)
//   every table keeps created_by/updated_by (nullable, wrapper-populated)
//   users.user_code auto-generated 6-char, admin-overridable
//
// Predicate compat: during Phase 2/3 migration, routes still pass JS functions
// (u => u.role === 'player'). The adapter runs the query then filters in JS.
// New code should pass plain objects ({role: 'player'}) so filtering happens
// in SQL. All methods are async — callers must await when DB_BACKEND=mysql.
import { customAlphabet } from 'nanoid'
import { getKnex } from './connection.js'

const PK = { users: 'user_id' }
const pkOf = (collection) => PK[collection] || 'id'

const genUserCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

function toApiRow(collection, row) {
  if (!row) return row
  const out = { ...row }
  if (collection === 'users' && row.user_id !== undefined) out.id = row.user_id
  if (collection === 'notifications' && row.is_read !== undefined) out.read = row.is_read
  if (collection === 'audit_logs' && row.rec_before !== undefined) out.before = row.rec_before
  return out
}

// Accepts API-shaped input (`id`, `read`, `before`) and normalizes to DB columns.
function toDbRow(collection, input) {
  const row = { ...input }
  if (collection === 'users' && row.id !== undefined && row.user_id === undefined) {
    row.user_id = row.id
    delete row.id
  }
  if (collection === 'notifications' && row.read !== undefined && row.is_read === undefined) {
    row.is_read = row.read
  }
  if (collection === 'audit_logs' && row.before !== undefined && row.rec_before === undefined) {
    row.rec_before = typeof row.before === 'string' ? row.before : JSON.stringify(row.before)
  }
  // Never write API-only aliases back as extra columns
  if (collection === 'users') delete row.id
  if (collection === 'notifications') delete row.read
  if (collection === 'audit_logs') delete row.before
  // Stringify JSON-ish objects for JSON columns (knex/mysql2 also accepts objects,
  // but explicit stringify keeps TEXT fallback safe)
  for (const k of ['permissions', 'sideA', 'sideB', 'sessions_json', 'payload']) {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] === 'object') {
      try { row[k] = JSON.stringify(row[k]) } catch { row[k] = null }
    }
  }
  // audit before/after are LONGTEXT holding JSON strings-or-null
  for (const k of ['rec_before', 'after']) {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] === 'object') {
      try { row[k] = JSON.stringify(row[k]) } catch { row[k] = null }
    }
  }
  return row
}

function applyJsPredicate(rows, predicate) {
  if (!predicate) return rows
  if (typeof predicate === 'function') return rows.filter(predicate)
  if (typeof predicate === 'object') {
    return rows.filter((r) => Object.entries(predicate).every(([k, v]) => {
      // allow API aliases in object predicates
      const key = k === 'id' ? 'user_id' : k === 'read' ? 'is_read' : k === 'before' ? 'rec_before' : k
      const rv = r[key] ?? r[k]
      return rv === v
    }))
  }
  return rows
}

function applyWhere(qb, collection, where) {
  if (!where || typeof where === 'function') return qb
  for (const [k, v] of Object.entries(where)) {
    const key = k === 'id' && collection === 'users' ? 'user_id'
      : k === 'read' && collection === 'notifications' ? 'is_read'
        : k === 'before' && collection === 'audit_logs' ? 'rec_before' : k
    if (v === null) qb.whereNull(key)
    else qb.where(key, v)
  }
  return qb
}

async function ensureUserCode(knex, row) {
  if (row.user_code) return row
  for (let i = 0; i < 5; i++) {
    const code = genUserCode()
    const exists = await knex('users').where({ user_code: code }).first()
    if (!exists) { row.user_code = code; return row }
  }
  row.user_code = genUserCode()
  return row
}

function withAuditCols(collection, row, actorId, isInsert) {
  if (actorId !== null && actorId !== undefined) {
    if (isInsert && row.created_by === undefined) row.created_by = actorId
    if (row.updated_by === undefined) row.updated_by = actorId
  }
  return row
}

export function createMysqlDb() {
  const knex = () => getKnex()

  return {
    isMysql: true,

    async query(collection, { where, orderBy, limit, offset } = {}) {
      let qb = knex()(collection)
      applyWhere(qb, collection, where)
      let rows = await qb.select('*')
      if (typeof where === 'function') rows = rows.filter(where)
      if (orderBy && typeof orderBy === 'function') rows = [...rows].sort(orderBy)
      if (offset) rows = rows.slice(offset)
      if (limit) rows = rows.slice(0, limit)
      return rows.map((r) => toApiRow(collection, r))
    },

    async get(collection, id) {
      const row = await knex()(collection).where(pkOf(collection), id).first()
      return row ? toApiRow(collection, row) : null
    },

    async find(collection, predicate) {
      const rows = await this.findAll(collection, predicate)
      return rows[0] || null
    },

    async findAll(collection, predicate) {
      if (predicate && typeof predicate !== 'function' && typeof predicate === 'object') {
        const rows = await applyWhere(knex()(collection), collection, predicate).select('*')
        return rows.map((r) => toApiRow(collection, r))
      }
      const rows = await knex()(collection).select('*')
      return applyJsPredicate(rows, predicate).map((r) => toApiRow(collection, r))
    },

    async insert(collection, record, actorId = null) {
      let row = toDbRow(collection, record)
      // Never insert explicit PK on normal path (migration script sets them explicitly)
      if (collection === 'users' && row.user_id !== undefined && record.user_id === undefined && record.id === undefined) {
        // api-shaped {id} already mapped; drop auto-gen conflict — let AUTO_INCREMENT win
        // (delete only when caller didn't explicitly intend an id)
      }
      if (collection === 'users') await ensureUserCode(knex(), row)
      withAuditCols(collection, row, actorId ?? record.created_by ?? null, true)
      if (collection === 'users' && row.user_id === undefined) delete row.user_id
      if (row.user_code === undefined) delete row.user_code
      const ids = await knex()(collection).insert(row)
      const pk = pkOf(collection)
      const insertedId = row[pk] ?? ids[0]
      return this.get(collection, insertedId)
    },

    async update(collection, id, updates, actorId = null) {
      const row = toDbRow(collection, updates)
      // Never allow PK overwrite via API `id`
      delete row[pkOf(collection)]
      withAuditCols(collection, row, actorId ?? updates.updated_by ?? null, false)
      await knex()(collection).where(pkOf(collection), id).update(row)
      return this.get(collection, id)
    },

    async remove(collection, id) {
      const n = await knex()(collection).where(pkOf(collection), id).del()
      return n > 0
    },

    async count(collection, predicate) {
      const rows = await this.findAll(collection, predicate)
      return rows.length
    },

    async sum(collection, field, predicate) {
      const rows = await this.findAll(collection, predicate)
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    },

    async insertBatch(collection, records, actorId = null) {
      let n = 0
      for (const rec of records) { await this.insert(collection, rec, actorId); n++ }
      return n
    },

    async upsert(collection, matchFields, record, actorId = null) {
      const where = {}
      for (const f of matchFields) where[f] = record[f]
      const existing = await applyWhere(knex()(collection), collection, where).first()
      if (existing) return this.update(collection, existing[pkOf(collection)], record, actorId)
      return this.insert(collection, record, actorId)
    },

    async transaction(fn) {
      const trx = await getKnex().transaction()
      try {
        const result = await fn(trx)
        await trx.commit()
        return result
      } catch (e) { await trx.rollback(); throw e }
    },

    async clear(collection) {
      await knex()(collection).del()
    },

    async replace() {
      throw new Error('replace() is disabled on MySQL — whole-DB replace would diverge from relational data. Use migrations.')
    },

    // Raw escape hatch for Phase 2/3 route rewrites (transactions, joins)
    knex: () => getKnex(),
  }
}

export default createMysqlDb
