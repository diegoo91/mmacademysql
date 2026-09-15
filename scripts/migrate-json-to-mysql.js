#!/usr/bin/env node
/**
 * Load JSON-file data into MySQL (mmacademy).
 *
 * Source: --source local (default: server/data/academy.db.json, fallback
 *   server/academy.db.json) | prod (pull via /api/admin/import-db/export-db
 *   with PROD_API_BASE/ADMIN_EMAIL/ADMIN_PASSWORD/IMPORT_SECRET, backing up
 *   local first — same pattern as scripts/pull-prod-db-to-local.js).
 * Target: MySQL via DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
 *   (or DATABASE_URL/MYSQL_URL). Defaults: localhost:5175/mmacademy.
 *
 * Normalizers reused from scripts/export-mysql.js: ""->NULL, both timestamp
 * formats -> DATETIME(3), sessions_json/payload/sideA/sideB -> real JSON,
 * read->is_read, before->rec_before, id->user_id (users).
 *
 * Load order (FK-safe): users -> court_defaults -> import_batches -> bookings
 *   -> slots -> payments -> booking_requests -> comments -> notifications
 *   -> conversion_requests -> expenses -> results -> audit_logs.
 * Preserves original ids, then resets AUTO_INCREMENT. Orphans are logged
 * and nulled, never fail the load.
 *
 * Usage:
 *   node scripts/migrate-json-to-mysql.js [--source local|prod] [--dry-run] [--truncate]
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import knex from 'knex'
import knexConfig from '../server/src/db/knexfile.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PRIMARY = join(ROOT, 'server', 'data', 'academy.db.json')
const FALLBACK = join(ROOT, 'server', 'academy.db.json')
const BACKUP_DIR = join(ROOT, 'server', 'data', 'backups')

const args = new Set(process.argv.slice(2))
const opt = (name) => {
  const a = [...args].find((x) => x.startsWith(name + '='))
  return a ? a.split('=').slice(1).join('=') : (args.has(name) ? true : undefined)
}
const SOURCE = opt('--source') === true ? 'local' : (opt('--source') || 'local')
const DRY_RUN = args.has('--dry-run')
const TRUNCATE = args.has('--truncate')

// ---------- normalizers (same semantics as export-mysql.js) ----------
const pad = (n, l = 2) => String(n).padStart(l, '0')
function normDateTime(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}
function normDate(v) {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const toInt = (v) => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
const toDec = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const toText = (v) => (v === null || v === undefined ? null : (typeof v === 'object' ? JSON.stringify(v) : String(v)))
function toJsonObj(v, ctx, warnings) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') return v
  const s = String(v).trim()
  if (!s) return null
  try { return JSON.parse(s) } catch {
    warnings.push(`${ctx}: invalid JSON exported as NULL`)
    return null
  }
}
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const genCode = () => Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('')

// ---------- source ----------
async function loadSource() {
  if (SOURCE === 'prod') {
    for (const k of ['PROD_API_BASE', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'IMPORT_SECRET']) {
      if (!process.env[k]) { console.error(`Missing required env var: ${k}`); process.exit(1) }
    }
    console.log(`Logging in as ${process.env.ADMIN_EMAIL}...`)
    const loginRes = await fetch(`${process.env.PROD_API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    })
    if (!loginRes.ok) { console.error('Prod login failed:', loginRes.status); process.exit(1) }
    const { accessToken } = await loginRes.json()
    const exportRes = await fetch(
      `${process.env.PROD_API_BASE}/admin/import-db/export-db?secret=${encodeURIComponent(process.env.IMPORT_SECRET)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!exportRes.ok) { console.error('Prod export failed:', exportRes.status); process.exit(1) }
    const database = await exportRes.json()
    if (existsSync(PRIMARY)) {
      mkdirSync(BACKUP_DIR, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      writeFileSync(join(BACKUP_DIR, `academy.db.${ts}.json`), readFileSync(PRIMARY, 'utf-8'))
      console.log('Local backup saved.')
    }
    return { data: database, label: 'prod (pulled, local backed up)' }
  }
  const p = existsSync(PRIMARY) ? PRIMARY : FALLBACK
  if (!existsSync(p)) { console.error(`Database file not found: ${PRIMARY}`); process.exit(1) }
  return { data: JSON.parse(readFileSync(p, 'utf-8')), label: p }
}

// ---------- row mappers ----------
function mapRows(data, warnings) {
  const arr = (k) => (Array.isArray(data[k]) ? data[k] : [])
  const usedCodes = new Set(arr('users').map((u) => u.user_code).filter(Boolean))

  const users = arr('users').map((u) => {
    let code = u.user_code || null
    if (!code) { do { code = genCode() } while (usedCodes.has(code)); usedCodes.add(code) }
    return {
      user_id: toInt(u.id ?? u.user_id),
      name: toText(u.name), email: toText(u.email), phone: toText(u.phone),
      dob: normDate(u.dob), password_hash: toText(u.password_hash), role: toText(u.role),
      skill_level: toText(u.skill_level), member_since: toText(u.member_since),
      force_password_change: toInt(u.force_password_change),
      member_code: toText(u.member_code), user_code: code,
      is_claimed: toInt(u.is_claimed), private_balance: toInt(u.private_balance) ?? 0,
      group_balance: toInt(u.group_balance) ?? 0, balance_zero_since: normDateTime(u.balance_zero_since),
      notes: toText(u.notes), position: toText(u.position),
      permissions: toJsonObj(u.permissions, `users id=${u.id} permissions`, warnings),
      avatar: toText(u.avatar), created_at: normDateTime(u.created_at), updated_at: normDateTime(u.updated_at),
    }
  })
  const userIds = new Set(users.map((u) => u.user_id))

  const court_defaults = arr('court_defaults').map((r) => ({
    id: toInt(r.id), court: toInt(r.court),
    coach_id: r.coach_id != null && userIds.has(Number(r.coach_id)) ? toInt(r.coach_id) : (r.coach_id != null ? (warnings.push(`court_defaults id=${r.id}: orphan coach_id ${r.coach_id} -> NULL`), null) : null),
    created_at: normDateTime(r.created_at), updated_at: normDateTime(r.updated_at),
  }))

  const import_batches = arr('import_batches').map((r) => ({
    id: toInt(r.id), kind: toText(r.kind), filename: toText(r.filename),
    row_count: toInt(r.row_count), error_count: toInt(r.error_count),
    by_user: r.by_user != null && userIds.has(Number(r.by_user)) ? toInt(r.by_user) : (r.by_user != null && r.by_user !== '' ? (warnings.push(`import_batches id=${r.id}: orphan by_user ${r.by_user} -> NULL`), null) : null),
    status: toText(r.status), created_at: normDateTime(r.created_at), updated_at: normDateTime(r.updated_at),
  }))
  const batchIds = new Set(import_batches.map((b) => b.id))

  const bookings = arr('bookings').map((b) => ({
    id: toInt(b.id), ref: toText(b.ref),
    user_id: b.user_id != null && userIds.has(Number(b.user_id)) ? toInt(b.user_id) : (b.user_id != null && b.user_id !== '' ? (warnings.push(`bookings id=${b.id}: orphan user_id ${b.user_id} -> NULL`), null) : null),
    session_type: toText(b.session_type), mode: toText(b.mode),
    sessions_json: toJsonObj(b.sessions_json, `bookings id=${b.id} sessions_json`, warnings),
    sessions: toText(b.sessions), total: toDec(b.total), status: toText(b.status),
    player_name: toText(b.player_name), private_remaining: toInt(b.private_remaining),
    group_remaining: toInt(b.group_remaining), deducted_from: toText(b.deducted_from),
    deducted_count: toInt(b.deducted_count), paid: toInt(b.paid ?? b.amountPaid),
    amount_paid: toDec(b.amount_paid ?? b.amountPaid),
    payment_method: toText(b.payment_method), payment_date: normDate(b.payment_date ?? b.paidAt),
    import_batch: b.import_batch != null && batchIds.has(Number(b.import_batch)) ? toInt(b.import_batch) : (b.import_batch != null && b.import_batch !== '' ? (warnings.push(`bookings id=${b.id}: orphan import_batch ${b.import_batch} -> NULL`), null) : null),
    created_at: normDateTime(b.created_at), updated_at: normDateTime(b.updated_at),
  }))
  const bookingIds = new Set(bookings.map((b) => b.id))

  const slots = arr('slots').map((s) => {
    // Legacy inserts.sql form player_name_1/_2 never appears in JSON, but merge defensively
    let text = s.player_text
    if ((text === null || text === undefined) && (s.player_name_1 || s.player_name_2)) {
      text = [s.player_name_1, s.player_name_2].filter(Boolean).join(' / ')
      warnings.push(`slots id=${s.id}: merged player_name_1/_2 into player_text`)
    }
    return {
      id: toInt(s.id), date: normDate(s.date), time: toText(s.time), court: toInt(s.court),
      player_text: toText(text),
      booking_id: s.booking_id != null && bookingIds.has(Number(s.booking_id)) ? toInt(s.booking_id) : (s.booking_id != null && s.booking_id !== '' ? (warnings.push(`slots id=${s.id}: orphan booking_id ${s.booking_id} -> NULL`), null) : null),
      user_id: s.user_id != null && userIds.has(Number(s.user_id)) ? toInt(s.user_id) : (s.user_id != null && s.user_id !== '' ? (warnings.push(`slots id=${s.id}: orphan user_id ${s.user_id} -> NULL`), null) : null),
      coach_id: s.coach_id != null && userIds.has(Number(s.coach_id)) ? toInt(s.coach_id) : (s.coach_id != null && s.coach_id !== '' ? (warnings.push(`slots id=${s.id}: orphan coach_id ${s.coach_id} -> NULL`), null) : null),
      session_type: toText(s.session_type), status: toText(s.status),
      created_at: normDateTime(s.created_at), updated_at: normDateTime(s.updated_at),
    }
  })
  const slotIds = new Set(slots.map((s) => s.id))

  const payments = arr('payments').map((p) => ({
    id: toInt(p.id), ref: toText(p.ref), date: normDate(p.date), player_name: toText(p.player_name),
    player_id: p.player_id != null && userIds.has(Number(p.player_id)) ? toInt(p.player_id) : (p.player_id != null && p.player_id !== '' ? (warnings.push(`payments id=${p.id}: orphan player_id ${p.player_id} -> NULL`), null) : null),
    method: toText(p.method), amount: toDec(p.amount),
    private_sessions: toInt(p.private_sessions) ?? 0, group_sessions: toInt(p.group_sessions) ?? 0,
    notes: toText(p.notes), status: toText(p.status),
    booking_id: p.booking_id != null && bookingIds.has(Number(p.booking_id)) ? toInt(p.booking_id) : (p.booking_id != null && p.booking_id !== '' ? (warnings.push(`payments id=${p.id}: orphan booking_id ${p.booking_id} -> NULL`), null) : null),
    created_by: p.created_by != null && userIds.has(Number(p.created_by)) ? toInt(p.created_by) : null,
    created_at: normDateTime(p.created_at), updated_at: normDateTime(p.updated_at),
  }))

  const booking_requests = arr('booking_requests').map((r) => ({
    id: toInt(r.id), kind: toText(r.kind),
    slot_id: r.slot_id != null && slotIds.has(Number(r.slot_id)) ? toInt(r.slot_id) : (r.slot_id != null && r.slot_id !== '' ? (warnings.push(`booking_requests id=${r.id}: orphan slot_id ${r.slot_id} -> NULL`), null) : null),
    booking_id: r.booking_id != null && bookingIds.has(Number(r.booking_id)) ? toInt(r.booking_id) : (r.booking_id != null && r.booking_id !== '' ? (warnings.push(`booking_requests id=${r.id}: orphan booking_id ${r.booking_id} -> NULL`), null) : null),
    player_id: r.player_id != null && userIds.has(Number(r.player_id)) ? toInt(r.player_id) : (r.player_id != null && r.player_id !== '' ? (warnings.push(`booking_requests id=${r.id}: orphan player_id ${r.player_id} -> NULL`), null) : null),
    player_name: toText(r.player_name),
    payload: toJsonObj(r.payload, `booking_requests id=${r.id} payload`, warnings),
    status: toText(r.status),
    decided_by: r.decided_by != null && userIds.has(Number(r.decided_by)) ? toInt(r.decided_by) : null,
    decided_at: normDateTime(r.decided_at),
    created_at: normDateTime(r.created_at), updated_at: normDateTime(r.updated_at),
  }))

  const comments = arr('comments').map((c) => ({
    id: toInt(c.id),
    user_id: c.user_id != null && userIds.has(Number(c.user_id)) ? toInt(c.user_id) : null,
    user_name: toText(c.user_name), text: toText(c.text), rating: toInt(c.rating),
    status: toText(c.status), created_at: normDateTime(c.created_at), updated_at: normDateTime(c.updated_at),
  }))

  const notifications = arr('notifications').map((n) => ({
    id: toInt(n.id),
    user_id: toInt(n.user_id), kind: toText(n.kind), title: toText(n.title),
    body: toText(n.body), link: toText(n.link),
    is_read: toInt(n.is_read ?? n.read) ?? 0,
    created_at: normDateTime(n.created_at), updated_at: normDateTime(n.updated_at),
  }))

  const conversion_requests = arr('conversion_requests').map((r) => ({
    id: toInt(r.id),
    user_id: r.user_id != null && userIds.has(Number(r.user_id)) ? toInt(r.user_id) : null,
    user_name: toText(r.user_name), from: toText(r.from), to: toText(r.to),
    count: toInt(r.count), status: toText(r.status),
    created_at: normDateTime(r.created_at), updated_at: normDateTime(r.updated_at),
  }))

  const expenses = arr('expenses').map((e) => ({
    id: toInt(e.id), date: normDate(e.date), category: toText(e.category),
    description: toText(e.description), amount: toDec(e.amount),
    created_by: e.created_by != null && userIds.has(Number(e.created_by)) ? toInt(e.created_by) : null,
    created_at: normDateTime(e.created_at), updated_at: normDateTime(e.updated_at),
  }))

  const results = arr('results').map((r) => ({
    id: toInt(r.id), date: normDate(r.date), format: toText(r.format),
    sideA: toJsonObj(r.sideA, `results id=${r.id} sideA`, warnings),
    sideB: toJsonObj(r.sideB, `results id=${r.id} sideB`, warnings),
    side_a: toText(r.side_a), side_b: toText(r.side_b),
    player_a: toText(r.player_a), player_b: toText(r.player_b),
    score_a: toInt(r.score_a), score_b: toInt(r.score_b), score_text: toText(r.score_text),
    winner_side: toText(r.winner_side), winner: toText(r.winner), status: toText(r.status),
    submitted_by: r.submitted_by != null && userIds.has(Number(r.submitted_by)) ? toInt(r.submitted_by) : null,
    court: toInt(r.court), court_time: toText(r.court_time), competition: toText(r.competition),
    notes: toText(r.notes),
    import_batch: r.import_batch != null && batchIds.has(Number(r.import_batch)) ? toInt(r.import_batch) : null,
    created_at: normDateTime(r.created_at), updated_at: normDateTime(r.updated_at),
  }))

  const audit_logs = arr('audit_logs').map((a) => ({
    id: toInt(a.id), timestamp: normDateTime(a.timestamp),
    actor_id: a.actor_id != null && userIds.has(Number(a.actor_id)) ? toInt(a.actor_id) : null,
    actor_name: toText(a.actor_name), actor_role: toText(a.actor_role), ip: toText(a.ip),
    action: toText(a.action), target_type: toText(a.target_type),
    target_id: a.target_id === null || a.target_id === undefined ? null : String(a.target_id),
    rec_before: toText(a.rec_before ?? a.before), after: toText(a.after),
    created_at: normDateTime(a.created_at), updated_at: normDateTime(a.updated_at),
  }))

  return { users, court_defaults, import_batches, bookings, slots, payments, booking_requests, comments, notifications, conversion_requests, expenses, results, audit_logs }
}

const LOAD_ORDER = ['users', 'court_defaults', 'import_batches', 'bookings', 'slots', 'payments', 'booking_requests', 'comments', 'notifications', 'conversion_requests', 'expenses', 'results', 'audit_logs']
const PK = { users: 'user_id' }

async function main() {
  const { data, label } = await loadSource()
  console.log(`Source: ${label}`)
  const warnings = []
  const tables = mapRows(data, warnings)

  const total = LOAD_ORDER.reduce((s, t) => s + tables[t].length, 0)
  console.log(`Rows to load: ${total} (${LOAD_ORDER.map((t) => `${t}=${tables[t].length}`).join(', ')})`)

  if (DRY_RUN) {
    console.log('\n--dry-run: no writes. First row per non-empty table:')
    for (const t of LOAD_ORDER) {
      if (tables[t].length) console.log(`\n-- ${t} (1/${tables[t].length}):`, JSON.stringify(tables[t][0]).slice(0, 500))
    }
    if (warnings.length) { console.log('\nWarnings:'); warnings.slice(0, 50).forEach((w) => console.log(`  ! ${w}`)) }
    return
  }

  const db = knex({ ...knexConfig, connection: { ...knexConfig.connection } })
  try {
    await db.raw('SELECT 1')
    console.log(`Target: ${knexConfig.connection.host}:${knexConfig.connection.port}/${knexConfig.connection.database}`)

    if (!TRUNCATE) {
      for (const t of LOAD_ORDER) {
        const [{ n }] = await db(t).count({ n: '*' })
        if (Number(n) > 0) {
          console.error(`Refusing: table \`${t}\` not empty (${n} rows). Re-run with --truncate to reload.`)
          process.exit(2)
        }
      }
    } else {
      console.log('Truncating (reverse FK order)...')
      await db.raw('SET FOREIGN_KEY_CHECKS=0')
      for (const t of [...LOAD_ORDER].reverse()) await db(t).del()
      await db.raw('SET FOREIGN_KEY_CHECKS=1')
    }

    await db.raw('SET FOREIGN_KEY_CHECKS=0')
    for (const t of LOAD_ORDER) {
      const rows = tables[t]
      if (!rows.length) { console.log(`- ${t}: 0 rows, skip`); continue }
      const CHUNK = 200
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db(t).insert(rows.slice(i, i + CHUNK))
      }
      const pk = PK[t] || 'id'
      const maxId = rows.reduce((m, r) => Math.max(m, Number(r[pk]) || 0), 0)
      if (maxId > 0) await db.raw(`ALTER TABLE \`${t}\` AUTO_INCREMENT = ${maxId + 1}`)
      console.log(`- ${t}: ${rows.length} rows`)
    }
    await db.raw('SET FOREIGN_KEY_CHECKS=1')

    // Verify counts
    console.log('\nVerify (MySQL vs JSON):')
    for (const t of LOAD_ORDER) {
      const [{ n }] = await db(t).count({ n: '*' })
      const ok = Number(n) === tables[t].length ? 'OK' : 'MISMATCH'
      console.log(`  ${t}: mysql=${n} json=${tables[t].length} ${ok}`)
    }
    // Spot checks
    const admin = await db('users').where({ email: 'admin@mmpadel.com' }).first()
    console.log(`\nSpot check: admin@mmpadel.com -> ${admin ? `user_id=${admin.user_id} OK` : 'MISSING'}`)
    const bk = await db('bookings').first()
    if (bk) {
      const n = await db('slots').where({ booking_id: bk.id }).count({ n: '*' })
      console.log(`Spot check: booking id=${bk.id} ref=${bk.ref} has ${n[0].n} slots`)
    }
    if (warnings.length) { console.log('\nWarnings:'); warnings.slice(0, 100).forEach((w) => console.log(`  ! ${w}`)) }
    console.log('\nDone. Run with --dry-run first on prod data; re-runs need --truncate.')
  } finally {
    await db.destroy()
  }
}

main().catch((e) => { console.error('Load failed:', e.message); process.exit(1) })
