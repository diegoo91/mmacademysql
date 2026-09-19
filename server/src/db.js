// Async data-access layer with two backends:
//   - PostgreSQL (Knex) when DB_ENABLED=true  → local migration target
//   - JSON file (legacy ./database.js, untouched) otherwise → production path
//
// Both backends expose the SAME async API so routes work unchanged on either.
// `where` accepts either:
//   - an object filter  { status: 'x', user_id: 2, id: [1,2], date: { gte: '2026-01-01' }, name: { like: '%ali%' } }
//     ops: like | gte | lte | gt | lt | ne | in   (scalar = equality, array = IN, null = IS NULL)
//   - a predicate function (row) => bool — applied in JS on BOTH backends (parity first, perf later)
// `opts.orderBy` accepts [[col, dir], ...] or a legacy comparator function.
import legacyDb from './database.js'
import { getKnex, now, stamp, DB_ENABLED } from './sql.js'

export const isSql = () => DB_ENABLED

export const TABLES = [
  'users', 'results', 'slots', 'bookings', 'import_batches', 'comments',
  'notifications', 'conversion_requests', 'expenses', 'booking_requests',
  'payments', 'audit_logs', 'court_defaults', 'app_sessions', 'roles',
  'coach_daily_hours', 'coach_payments',
]

// ---------------------------------------------------------------------------
// PG ↔ App column mapping
// The existing pg schema uses different column names than the app code expects.
// These maps translate transparently so route files never change.
// ---------------------------------------------------------------------------
// pg col → app col (read direction)
const PG_TO_APP = {
  users: { user_id: 'id' },
  app_sessions: { session_id: 'id' },
  notifications: { is_read: 'read' },
  conversion_requests: { from_type: 'from', to_type: 'to' },
  audit_logs: { rec_before: 'before', rec_after: 'after' },
  results: { sidea: 'sideA', sideb: 'sideB', sidea_ids: 'sideA_ids', sideb_ids: 'sideB_ids' },
}
// app col → pg col (write direction) — inverse of above
const APP_TO_PG = {}
for (const [table, map] of Object.entries(PG_TO_APP)) {
  APP_TO_PG[table] = {}
  for (const [pg, app] of Object.entries(map)) {
    APP_TO_PG[table][app] = pg
  }
}
// PK column in pg per table (app always calls it 'id')
const PG_PK = { users: 'user_id', app_sessions: 'session_id' }

function pgToApp(table, row) {
  if (!row || typeof row !== 'object') return row
  const map = PG_TO_APP[table]
  if (!map) return row
  const out = { ...row }
  for (const [pgCol, appCol] of Object.entries(map)) {
    if (pgCol in out) { out[appCol] = out[pgCol]; delete out[pgCol] }
  }
  return out
}

function pgToAppRows(table, rows) {
  return rows.map(r => pgToApp(table, r))
}

function appToPg(table, obj) {
  const map = APP_TO_PG[table]
  if (!map) return obj
  const out = { ...obj }
  for (const [appCol, pgCol] of Object.entries(map)) {
    if (appCol in out) { out[pgCol] = out[appCol]; delete out[appCol] }
  }
  return out
}

// Map app 'id' value → pg PK column for WHERE clauses
function whereId(table, id) {
  const pk = PG_PK[table]
  return pk ? { [pk]: toId(id) } : { id: toId(id) }
}

// ---------------------------------------------------------------------------
// Columns needing '' → NULL / object → JSON normalization on the SQL backend.
// (PostgreSQL rejects '' for DATE/TIMESTAMP/JSONB columns.)
const DATE_COLS = {
  users: ['dob', 'balance_zero_since', 'created_at', 'updated_at'],
  results: ['date', 'created_at', 'updated_at'],
  slots: ['date', 'created_at', 'updated_at'],
  bookings: ['payment_date', 'created_at', 'updated_at'],
  import_batches: ['created_at', 'updated_at'],
  comments: ['created_at', 'updated_at'],
  notifications: ['created_at', 'updated_at'],
  conversion_requests: ['created_at', 'updated_at'],
  expenses: ['date', 'created_at', 'updated_at'],
  booking_requests: ['decided_at', 'created_at', 'updated_at'],
  payments: ['date', 'created_at', 'updated_at'],
  audit_logs: ['timestamp', 'created_at', 'updated_at'],
  app_sessions: ['refresh_expires_at', 'loggedin_at', 'loggedout_at', 'last_req_at', 'created_at', 'updated_at'],
  court_defaults: [],
  roles: ['created_at', 'updated_at'],
  coach_daily_hours: ['date', 'created_at', 'updated_at'],
  coach_payments: ['date', 'created_at'],
}
const JSON_COLS = {
  results: ['sidea', 'sideb', 'sidea_ids', 'sideb_ids'],
  bookings: ['sessions_json'],
  booking_requests: ['payload'],
  roles: ['permissions'],
}
const DECIMAL_COLS = {
  bookings: ['total', 'amount_paid'],
  expenses: ['amount'],
  payments: ['amount'],
}

function normalizeForPg(table, obj) {
  // First map app columns → pg columns
  const mapped = appToPg(table, obj)

  const dates = new Set(DATE_COLS[table] || [])
  const jsons = new Set(JSON_COLS[table] || [])
  const out = {}
  for (const [k, v] of Object.entries(mapped)) {
    if (v === undefined) continue
    if (typeof v === 'boolean') { out[k] = v ? 1 : 0; continue }
    if (jsons.has(k)) {
      if (v === null || v === '') { out[k] = null; continue }
      out[k] = typeof v === 'string' ? v : JSON.stringify(v)
      continue
    }
    if (dates.has(k)) {
      if (v === null || v === '') { out[k] = null; continue }
      if (typeof v === 'string' && v.includes('T')) {
        const d = new Date(v)
        out[k] = Number.isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').slice(0, 19)
      } else {
        out[k] = typeof v === 'string' ? v.slice(0, 19) : v
      }
      continue
    }
    out[k] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Read normalizer — converts pg JS types back to the JSON-backend shape
// so routes can use string methods (.localeCompare, .slice, === 'YYYY-MM-DD')
// and Number arithmetic without changes.
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0')
function fmtDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return d
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function fmtDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return d
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function normalizeFromPg(table, row) {
  if (!row || typeof row !== 'object') return row
  // Map pg columns → app columns first
  let out = pgToApp(table, row)
  const dates = DATE_COLS[table] || []
  for (const col of dates) {
    if (out[col] instanceof Date) {
      const isDateOnly = ['date', 'payment_date', 'dob', 'decided_at'].includes(col)
      out[col] = isDateOnly ? fmtDate(out[col]) : fmtDateTime(out[col])
    }
  }
  const decimals = DECIMAL_COLS[table] || []
  for (const col of decimals) {
    if (out[col] !== null && out[col] !== undefined) out[col] = Number(out[col])
  }
  return out
}

function normalizeRows(table, rows) {
  return rows.map((r) => normalizeFromPg(table, r))
}

// ---------------------------------------------------------------------------
// Filter helpers (shared semantics)
// ---------------------------------------------------------------------------
function matchValue(actual, expected) {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [op, val] of Object.entries(expected)) {
      if (op === 'like') {
        const pattern = String(val).replace(/%/g, '').toLowerCase()
        if (!String(actual ?? '').toLowerCase().includes(pattern)) return false
      } else if (op === 'gte' && !(actual >= val)) return false
      else if (op === 'lte' && !(actual <= val)) return false
      else if (op === 'gt' && !(actual > val)) return false
      else if (op === 'lt' && !(actual < val)) return false
      else if (op === 'ne' && !(actual !== val)) return false
      else if (op === 'in' && !val.includes(actual)) return false
    }
    return true
  }
  if (Array.isArray(expected)) return expected.includes(actual)
  if (expected === null) return actual === null || actual === undefined
  return actual === expected
}

function matchRow(row, where) {
  if (!where) return true
  if (typeof where === 'function') return !!where(row)
  return Object.entries(where).every(([k, v]) => matchValue(row[k], v))
}

function applyObjectWhere(builder, where) {
  for (const [col, cond] of Object.entries(where || {})) {
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const [op, val] of Object.entries(cond)) {
        if (op === 'like') builder.whereILike(col, val)
        else if (op === 'gte') builder.where(col, '>=', val)
        else if (op === 'lte') builder.where(col, '<=', val)
        else if (op === 'gt') builder.where(col, '>', val)
        else if (op === 'lt') builder.where(col, '<', val)
        else if (op === 'ne') builder.whereNot(col, val)
        else if (op === 'in') builder.whereIn(col, val)
      }
    } else if (Array.isArray(cond)) {
      builder.whereIn(col, cond)
    } else if (cond === null) {
      builder.whereNull(col)
    } else {
      builder.where(col, cond)
    }
  }
  return builder
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows
  if (typeof orderBy === 'function') return [...rows].sort(orderBy)
  const specs = Array.isArray(orderBy[0]) ? orderBy : [orderBy]
  return [...rows].sort((a, b) => {
    for (const [col, dir] of specs) {
      const av = a[col]; const bv = b[col]
      if (av === bv) continue
      const cmp = av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1 : av < bv ? -1 : 1
      return String(dir).toLowerCase() === 'desc' ? -cmp : cmp
    }
    return 0
  })
}

function pageRows(rows, { limit, offset } = {}) {
  let out = rows
  if (offset) out = out.slice(offset)
  if (limit !== undefined && limit !== null) out = out.slice(0, limit)
  return out
}

const toId = (id) => Number(id)

// ---------------------------------------------------------------------------
// PostgreSQL backend (Knex)
// ---------------------------------------------------------------------------
function pgApi(trx) {
  const q = (table) => (trx || getKnex())(table)

  async function findAll(table, where, opts = {}) {
    if (typeof where === 'function') {
      const rows = await q(table).select()
      return pageRows(sortRows(normalizeRows(table, rows.filter(where)), opts.orderBy), opts)
    }
    let b = applyObjectWhere(q(table), where)
    if (opts.orderBy && typeof opts.orderBy !== 'function') {
      const specs = Array.isArray(opts.orderBy[0]) ? opts.orderBy : [opts.orderBy]
      for (const [col, dir] of specs) b = b.orderBy(col, dir)
    }
    if (opts.offset) b = b.offset(opts.offset)
    if (opts.limit !== undefined && opts.limit !== null) b = b.limit(opts.limit)
    let rows = normalizeRows(table, await b.select())
    if (opts.orderBy && typeof opts.orderBy === 'function') rows = sortRows(rows, opts.orderBy)
    return rows
  }

  return {
    backend: 'pg',
    async query(table, { where, orderBy, limit, offset } = {}) {
      return findAll(table, where, { orderBy, limit, offset })
    },
    async findAll(table, where, opts) { return findAll(table, where, opts) },
    async find(table, where) {
      const rows = await findAll(table, where, { limit: 1 })
      return rows[0] || null
    },
    async get(table, id) {
      const row = await q(table).where(whereId(table, id)).first()
      return row ? normalizeFromPg(table, row) : null
    },
    async insert(table, record) {
      const row = normalizeForPg(table, stamp(record, true))
      // Remove auto-generated PK before insert
      const pk = PG_PK[table]
      if (pk && (row[pk] === undefined || row[pk] === null)) delete row[pk]
      if (!pk && (row.id === undefined || row.id === null)) delete row.id
      const [res] = await q(table).insert(row).returning('*')
      return normalizeFromPg(table, res)
    },
    async insertMany(table, records) {
      if (!records.length) return 0
      const rows = records.map((r) => {
        const row = normalizeForPg(table, stamp(r, true))
        const pk = PG_PK[table]
        if (pk && (row[pk] === undefined || row[pk] === null)) delete row[pk]
        if (!pk && (row.id === undefined || row.id === null)) delete row.id
        return row
      })
      for (let i = 0; i < rows.length; i += 100) {
        await q(table).insert(rows.slice(i, i + 100))
      }
      return records.length
    },
    async update(table, id, updates) {
      const row = normalizeForPg(table, updates)
      // PG triggers auto-set updated_at; don't include it in the UPDATE
      delete row.updated_at; delete row.created_at; delete row.id
      const pk = PG_PK[table]
      if (pk) delete row[pk]
      await q(table).where(whereId(table, id)).update(row)
      return this.get(table, id)
    },
    async remove(table, id) {
      const n = await q(table).where(whereId(table, id)).del()
      return n > 0
    },
    async count(table, where) {
      if (typeof where === 'function') {
        const all = await q(table).select()
        return all.filter(where).length
      }
      const r = await applyObjectWhere(q(table), where).count({ c: '*' }).first()
      return Number(r.c)
    },
    async sum(table, field, where) {
      const rows = typeof where === 'function'
        ? (await q(table).select()).filter(where)
        : await applyObjectWhere(q(table), where).select(field)
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    },
    async upsert(table, matchFields, record) {
      const k = trx || getKnex()
      return k.transaction(async (inner) => {
        const api = pgApi(inner)
        const where = Object.fromEntries(matchFields.map((f) => [f, record[f]]))
        const existing = await api.find(table, where)
        if (existing) return api.update(table, existing.id, record)
        return api.insert(table, record)
      })
    },
    async clear(table) { await q(table).del() },
    async removeWhere(table, predicate) {
      const rows = await q(table).select()
      const toDelete = rows.filter(predicate)
      if (toDelete.length === 0) return 0
      const ids = toDelete.map(r => r.id || r.jti)
      if (ids.length > 0) await q(table).where(function() { for (const id of ids) this.orWhere('id', id).orWhere('jti', id) }).del()
      return toDelete.length
    },
    async replaceAll(data) {
      const k = trx || getKnex()
      for (const key of Object.keys(data)) {
        if (!TABLES.includes(key) || !Array.isArray(data[key])) throw new Error(`Invalid collection: ${key}`)
      }
      // Disable FK checks, truncate in reverse order, re-enable
      await k.raw('SET session_replication_role = replica')
      try {
        for (const t of [...TABLES].reverse()) await k(t).del()
        for (const t of TABLES) {
          const rows = data[t] || []
          if (!rows.length) continue
          const normed = rows.map((r) => normalizeForPg(t, r))
          for (let i = 0; i < normed.length; i += 100) await k(t).insert(normed.slice(i, i + 100))
          // Reset sequences
          const pk = PG_PK[t]
          if (!pk) {
            const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
            if (maxId > 0) await k.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), ${maxId + 1})`)
          }
        }
      } finally {
        await k.raw('SET session_replication_role = origin')
      }
    },
    async exportAll() {
      const k = trx || getKnex()
      const out = {}
      for (const t of TABLES) out[t] = normalizeRows(t, await k(t).select().orderBy(PG_PK[t] || 'id', 'asc'))
      return out
    },
    async transaction(fn) {
      const k = getKnex()
      return k.transaction(async (inner) => fn(pgApi(inner)))
    },
  }
}

// ---------------------------------------------------------------------------
// JSON backend (wraps legacy database.js — same process memory, async skin)
// ---------------------------------------------------------------------------
function jsonApi() {
  return {
    backend: 'json',
    async query(table, { where, orderBy, limit, offset } = {}) {
      let items = legacyDb.findAll(table, (r) => matchRow(r, where))
      if (orderBy) items = sortRows(items, orderBy)
      return pageRows(items, { limit, offset })
    },
    async findAll(table, where, opts = {}) {
      return this.query(table, { where, ...opts })
    },
    async find(table, where) {
      return legacyDb.find(table, (r) => matchRow(r, where))
    },
    async get(table, id) {
      return legacyDb.get(table, toId(id))
    },
    async insert(table, record) {
      return legacyDb.insert(table, { ...record })
    },
    async insertMany(table, records) {
      return legacyDb.insertBatch(table, records)
    },
    async update(table, id, updates) {
      return legacyDb.update(table, toId(id), updates)
    },
    async remove(table, id) {
      return legacyDb.remove(table, toId(id))
    },
    async count(table, where) {
      return legacyDb.count(table, where ? (r) => matchRow(r, where) : undefined)
    },
    async sum(table, field, where) {
      return legacyDb.sum(table, field, where ? (r) => matchRow(r, where) : undefined)
    },
    async upsert(table, matchFields, record) {
      return legacyDb.upsert(table, matchFields, record)
    },
    async clear(table) {
      legacyDb.clear(table)
    },
    async removeWhere(table, predicate) {
      const items = legacyDb.findAll(table)
      const toDelete = items.filter(predicate)
      for (const item of toDelete) {
        legacyDb.remove(table, item.id)
      }
      return toDelete.length
    },
    async replaceAll(data) {
      legacyDb.replace(data)
    },
    async exportAll() {
      const out = {}
      for (const t of TABLES) out[t] = legacyDb.findAll(t)
      return out
    },
    async transaction(fn) {
      const res = await fn(this)
      legacyDb.save()
      return res
    },
  }
}

// ---------------------------------------------------------------------------
// Selector — exactly one default export; routes never touch backends directly
// ---------------------------------------------------------------------------
const db = DB_ENABLED ? pgApi(null) : jsonApi()

export default db
export { now }
