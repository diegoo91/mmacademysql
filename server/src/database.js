import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { nanoid } from 'nanoid'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'academy.db.json')
const OLD_DB_PATH = join(__dirname, '..', 'academy.db.json')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

// Migration: if data/academy.db.json doesn't exist but the old one does, copy it over
if (!existsSync(DB_PATH) && existsSync(OLD_DB_PATH)) {
  try {
    writeFileSync(DB_PATH, readFileSync(OLD_DB_PATH, 'utf-8'))
  } catch { /* ignore */ }
}

// NOTE: This JSON-file database does NOT persist across Railway redeploys on the free tier.
// The file lives on an ephemeral container filesystem — data resets to seed state on each deploy.
// This setup is for testing/demo only. Production data would require either Railway's paid
// persistent volumes or migrating to a real database (Postgres, SQLite on volume, etc.).

let data = { users: [], results: [], slots: [], bookings: [], import_batches: [], comments: [], notifications: [], conversion_requests: [], expenses: [], booking_requests: [], payments: [], audit_logs: [] }

if (existsSync(DB_PATH)) {
  try { data = JSON.parse(readFileSync(DB_PATH, 'utf-8')) } catch { /* start fresh */ }
}

// Ensure all expected collections exist (handles adding new collections)
const DEFAULTS = { users: [], results: [], slots: [], bookings: [], import_batches: [], comments: [], notifications: [], conversion_requests: [], expenses: [], booking_requests: [], payments: [], audit_logs: [], court_defaults: [] }
for (const [key, val] of Object.entries(DEFAULTS)) {
  if (!Array.isArray(data[key])) data[key] = val
}

function save() { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)) }

function nextId(collection) {
  const items = data[collection]
  return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1
}

function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19) }

// Seed coach users and court defaults if missing (needed after Railway redeploys)
if (data.users.filter(u => u.role === 'coach').length === 0) {
  const COACH_HASH = '$2a$10$7V27YSU20H7PcyNtbkrmOu7h1Vo09lDAXFEMWZQ73/y9DmVxIy9z2'
  const ts = now()
  const baseId = nextId('users')
  const c1 = { id: baseId, name: 'Coach Laila', email: 'laila@mmpadel.com', phone: '', dob: '', role: 'coach', password_hash: COACH_HASH, is_claimed: true, skill_level: 'Advanced', notes: '', private_balance: 0, group_balance: 0, member_since: '2026', force_password_change: 0, member_code: String(baseId).padStart(3, '0'), created_at: ts, updated_at: ts }
  const c2 = { id: baseId + 1, name: 'Coach Carlos', email: 'carlos@mmpadel.com', phone: '', dob: '', role: 'coach', password_hash: COACH_HASH, is_claimed: true, skill_level: 'Advanced', notes: '', private_balance: 0, group_balance: 0, member_since: '2026', force_password_change: 0, member_code: String(baseId + 1).padStart(3, '0'), created_at: ts, updated_at: ts }
  data.users.push(c1, c2)
  data.court_defaults = [{ id: 1, court: 1, coach_id: c1.id }, { id: 2, court: 2, coach_id: c2.id }, { id: 3, court: 3, coach_id: c1.id }]
  save()
}

// Ensure Ahmed Saleh has correct balance (12 paid - 7 private - 2 group = 4 private / 0 group)
// Only correct if clearly wrong (negative balances from the old deduction bug)
const ahmed = data.users.find(u => u.id === 4)
if (ahmed && (ahmed.private_balance < 0 || ahmed.group_balance < 0)) {
  ahmed.private_balance = Math.max(ahmed.private_balance, 0)
  ahmed.group_balance = Math.max(ahmed.group_balance, 0)
  ahmed.balance_zero_since = null
  ahmed.updated_at = now()
  save()
}

const db = {
  save,

  query(collection, { where, orderBy, limit, offset } = {}) {
    let items = [...data[collection]]
    if (where) items = items.filter(where)
    if (orderBy) items.sort(orderBy)
    if (offset) items = items.slice(offset)
    if (limit) items = items.slice(0, limit)
    return items
  },

  get(collection, id) {
    return data[collection].find(i => i.id === id) || null
  },

  find(collection, predicate) {
    return data[collection].find(predicate) || null
  },

  findAll(collection, predicate) {
    return predicate ? data[collection].filter(predicate) : [...data[collection]]
  },

  insert(collection, record) {
    const id = nextId(collection)
    const rec = { id, ...record, created_at: record.created_at || now(), updated_at: now() }
    data[collection].push(rec)
    save()
    return rec
  },

  update(collection, id, updates) {
    const idx = data[collection].findIndex(i => i.id === id)
    if (idx === -1) return null
    data[collection][idx] = { ...data[collection][idx], ...updates, updated_at: now() }
    save()
    return data[collection][idx]
  },

  remove(collection, id) {
    const idx = data[collection].findIndex(i => i.id === id)
    if (idx === -1) return false
    data[collection].splice(idx, 1)
    save()
    return true
  },

  count(collection, predicate) {
    return predicate ? data[collection].filter(predicate).length : data[collection].length
  },

  sum(collection, field, predicate) {
    const items = predicate ? data[collection].filter(predicate) : data[collection]
    return items.reduce((s, i) => s + (Number(i[field]) || 0), 0)
  },

  insertBatch(collection, records) {
    let count = 0
    for (const record of records) {
      const id = nextId(collection)
      const rec = { id, ...record, created_at: now(), updated_at: now() }
      data[collection].push(rec)
      count++
    }
    save()
    return count
  },

  upsert(collection, matchFields, record) {
    const idx = data[collection].findIndex(i => matchFields.every(f => i[f] === record[f]))
    if (idx >= 0) {
      data[collection][idx] = { ...data[collection][idx], ...record, updated_at: now() }
      save()
      return data[collection][idx]
    }
    return db.insert(collection, record)
  },

  transaction(fn) {
    fn()
    save()
  },

  clear(collection) {
    data[collection] = []
    save()
  },

  replace(newData) {
    for (const key of Object.keys(DEFAULTS)) {
      data[key] = Array.isArray(newData[key]) ? newData[key] : []
    }
    save()
  }
}

export default db
