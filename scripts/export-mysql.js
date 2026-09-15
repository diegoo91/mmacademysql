#!/usr/bin/env node
/**
 * Export the JSON-file database to a MySQL 8 / MariaDB compatible .sql dump.
 *
 * Source: server/data/academy.db.json (falls back to server/academy.db.json)
 * Output: mysql-export/mmacademy.sql
 *
 * Usage:
 *   node scripts/export-mysql.js
 *
 * The dump contains CREATE DATABASE + CREATE TABLE + INSERTs + AUTO_INCREMENT
 * fixes. Import with:
 *   mysql -h localhost -P 5175 -u USER -p < mysql-export/mmacademy.sql
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PRIMARY = join(ROOT, 'server', 'data', 'academy.db.json')
const FALLBACK = join(ROOT, 'server', 'academy.db.json')
const OUT_DIR = join(ROOT, 'mysql-export')
const OUT_FILE = join(OUT_DIR, 'mmacademy.sql')

const DB_PATH = existsSync(PRIMARY) ? PRIMARY : FALLBACK
if (!existsSync(DB_PATH)) {
  console.error(`Database file not found: ${PRIMARY}`)
  process.exit(1)
}

const db = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
console.log(`Source: ${DB_PATH}`)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pad = (n, l = 2) => String(n).padStart(l, '0')

function escStr(s) {
  return (
    "'" +
    String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\0/g, '') +
    "'"
  )
}

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

function toInt(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function toDec(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

function toText(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function toJson(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v).trim()
  if (s === '') return null
  try {
    JSON.parse(s)
    return s
  } catch {
    return null // invalid JSON must not break a JSON column; warned at export
  }
}

// Column spec: [name, mysqlType, converter]
// Converters return a JS value ready for literal rendering via `lit()`.
function lit(type, value) {
  if (value === null || value === undefined) return 'NULL'
  const t = type.toUpperCase()
  if (t.startsWith('INT') || t.startsWith('TINYINT') || t.startsWith('DECIMAL')) {
    return String(value)
  }
  if (t === 'JSON') {
    return `CAST(${escStr(value)} AS JSON)`
  }
  return escStr(value)
}

const DT = (v) => normDateTime(v)
const D = (v) => normDate(v)
const I = (v) => toInt(v)
const DEC = (v) => toDec(v)
const T = (v) => toText(v)
const J = (v) => toJson(v)
const TID = (v) => (v === null || v === undefined || v === '' ? null : String(v))

// ---------------------------------------------------------------------------
// Table definitions (superset of observed keys + code-defined fields for
// collections that are currently empty). Everything except `id` is NULL-able
// so the import never fails on missing/legacy fields.
// ---------------------------------------------------------------------------
const TABLES = [
  {
    name: 'users',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(191) NULL,
  \`email\` VARCHAR(191) NULL,
  \`phone\` VARCHAR(32) NULL,
  \`dob\` DATE NULL,
  \`password_hash\` VARCHAR(255) NULL,
  \`role\` VARCHAR(32) NULL,
  \`skill_level\` VARCHAR(32) NULL,
  \`member_since\` VARCHAR(8) NULL,
  \`force_password_change\` TINYINT(1) NULL DEFAULT 1,
  \`member_code\` VARCHAR(16) NULL,
  \`is_claimed\` TINYINT(1) NULL,
  \`private_balance\` INT NULL DEFAULT 0,
  \`group_balance\` INT NULL DEFAULT 0,
  \`balance_zero_since\` DATETIME(3) NULL,
  \`notes\` TEXT NULL,
  \`position\` VARCHAR(64) NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  UNIQUE KEY \`uq_users_email\` (\`email\`),
  KEY \`ix_users_role\` (\`role\`)`,
    cols: [
      ['id', 'INT', I], ['name', 'VARCHAR', T], ['email', 'VARCHAR', T],
      ['phone', 'VARCHAR', T], ['dob', 'DATE', D], ['password_hash', 'VARCHAR', T],
      ['role', 'VARCHAR', T], ['skill_level', 'VARCHAR', T], ['member_since', 'VARCHAR', T],
      ['force_password_change', 'TINYINT', I], ['member_code', 'VARCHAR', T],
      ['is_claimed', 'TINYINT', I], ['private_balance', 'INT', I], ['group_balance', 'INT', I],
      ['balance_zero_since', 'DATETIME', DT], ['notes', 'TEXT', T], ['position', 'VARCHAR', T],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'results',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`date\` DATE NULL,
  \`format\` VARCHAR(32) NULL,
  \`sideA\` JSON NULL,
  \`sideB\` JSON NULL,
  \`side_a\` TEXT NULL,
  \`side_b\` TEXT NULL,
  \`player_a\` VARCHAR(191) NULL,
  \`player_b\` VARCHAR(191) NULL,
  \`score_a\` INT NULL,
  \`score_b\` INT NULL,
  \`score_text\` VARCHAR(32) NULL,
  \`winner_side\` VARCHAR(4) NULL,
  \`winner\` VARCHAR(191) NULL,
  \`status\` VARCHAR(32) NULL,
  \`submitted_by\` INT NULL,
  \`court\` INT NULL,
  \`court_time\` VARCHAR(128) NULL,
  \`competition\` VARCHAR(128) NULL,
  \`notes\` TEXT NULL,
  \`import_batch\` INT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_results_date\` (\`date\`),
  KEY \`ix_results_status\` (\`status\`)`,
    cols: [
      ['id', 'INT', I], ['date', 'DATE', D], ['format', 'VARCHAR', T],
      ['sideA', 'JSON', J], ['sideB', 'JSON', J], ['side_a', 'TEXT', T], ['side_b', 'TEXT', T],
      ['player_a', 'VARCHAR', T], ['player_b', 'VARCHAR', T], ['score_a', 'INT', I],
      ['score_b', 'INT', I], ['score_text', 'VARCHAR', T], ['winner_side', 'VARCHAR', T],
      ['winner', 'VARCHAR', T], ['status', 'VARCHAR', T], ['submitted_by', 'INT', I],
      ['court', 'INT', I], ['court_time', 'VARCHAR', T], ['competition', 'VARCHAR', T],
      ['notes', 'TEXT', T], ['import_batch', 'INT', I],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'slots',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`date\` DATE NULL,
  \`time\` VARCHAR(16) NULL,
  \`court\` INT NULL,
  \`player_text\` TEXT NULL,
  \`booking_id\` INT NULL,
  \`session_type\` VARCHAR(16) NULL,
  \`status\` VARCHAR(32) NULL,
  \`user_id\` INT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_slots_date\` (\`date\`),
  KEY \`ix_slots_booking\` (\`booking_id\`),
  KEY \`ix_slots_user\` (\`user_id\`)`,
    cols: [
      ['id', 'INT', I], ['date', 'DATE', D], ['time', 'VARCHAR', T], ['court', 'INT', I],
      ['player_text', 'TEXT', T], ['booking_id', 'INT', I], ['session_type', 'VARCHAR', T],
      ['status', 'VARCHAR', T], ['user_id', 'INT', I],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'bookings',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`ref\` VARCHAR(64) NULL,
  \`user_id\` INT NULL,
  \`session_type\` VARCHAR(16) NULL,
  \`mode\` VARCHAR(16) NULL,
  \`sessions_json\` JSON NULL,
  \`sessions\` TEXT NULL,
  \`total\` DECIMAL(10,2) NULL,
  \`status\` VARCHAR(32) NULL,
  \`player_name\` VARCHAR(191) NULL,
  \`private_remaining\` INT NULL,
  \`group_remaining\` INT NULL,
  \`deducted_from\` VARCHAR(64) NULL,
  \`deducted_count\` INT NULL,
  \`paid\` TINYINT(1) NULL,
  \`amount_paid\` DECIMAL(10,2) NULL,
  \`payment_method\` VARCHAR(32) NULL,
  \`payment_date\` DATE NULL,
  \`import_batch\` INT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  UNIQUE KEY \`uq_bookings_ref\` (\`ref\`),
  KEY \`ix_bookings_user\` (\`user_id\`),
  KEY \`ix_bookings_status\` (\`status\`)`,
    cols: [
      ['id', 'INT', I], ['ref', 'VARCHAR', T], ['user_id', 'INT', I],
      ['session_type', 'VARCHAR', T], ['mode', 'VARCHAR', T], ['sessions_json', 'JSON', J],
      ['sessions', 'TEXT', T], ['total', 'DECIMAL', DEC], ['status', 'VARCHAR', T],
      ['player_name', 'VARCHAR', T], ['private_remaining', 'INT', I], ['group_remaining', 'INT', I],
      ['deducted_from', 'VARCHAR', T], ['deducted_count', 'INT', I], ['paid', 'TINYINT', I],
      ['amount_paid', 'DECIMAL', DEC], ['payment_method', 'VARCHAR', T], ['payment_date', 'DATE', D],
      ['import_batch', 'INT', I], ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'import_batches',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`kind\` VARCHAR(32) NULL,
  \`filename\` VARCHAR(255) NULL,
  \`row_count\` INT NULL,
  \`error_count\` INT NULL,
  \`by_user\` INT NULL,
  \`status\` VARCHAR(32) NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL`,
    cols: [
      ['id', 'INT', I], ['kind', 'VARCHAR', T], ['filename', 'VARCHAR', T],
      ['row_count', 'INT', I], ['error_count', 'INT', I], ['by_user', 'INT', I],
      ['status', 'VARCHAR', T], ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'comments',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` INT NULL,
  \`user_name\` VARCHAR(191) NULL,
  \`text\` TEXT NULL,
  \`rating\` TINYINT NULL,
  \`status\` VARCHAR(32) NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_comments_status\` (\`status\`)`,
    cols: [
      ['id', 'INT', I], ['user_id', 'INT', I], ['user_name', 'VARCHAR', T],
      ['text', 'TEXT', T], ['rating', 'TINYINT', I], ['status', 'VARCHAR', T],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'notifications',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` INT NULL,
  \`kind\` VARCHAR(64) NULL,
  \`title\` VARCHAR(255) NULL,
  \`body\` TEXT NULL,
  \`link\` VARCHAR(255) NULL,
  \`read\` TINYINT(1) NULL DEFAULT 0,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_notifications_user\` (\`user_id\`)`,
    cols: [
      ['id', 'INT', I], ['user_id', 'INT', I], ['kind', 'VARCHAR', T],
      ['title', 'VARCHAR', T], ['body', 'TEXT', T], ['link', 'VARCHAR', T],
      ['read', 'TINYINT', I], ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'conversion_requests',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` INT NULL,
  \`user_name\` VARCHAR(191) NULL,
  \`from\` VARCHAR(32) NULL,
  \`to\` VARCHAR(32) NULL,
  \`count\` INT NULL,
  \`status\` VARCHAR(32) NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_conversion_status\` (\`status\`)`,
    cols: [
      ['id', 'INT', I], ['user_id', 'INT', I], ['user_name', 'VARCHAR', T],
      ['from', 'VARCHAR', T], ['to', 'VARCHAR', T], ['count', 'INT', I],
      ['status', 'VARCHAR', T], ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'expenses',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`date\` DATE NULL,
  \`category\` VARCHAR(64) NULL,
  \`description\` TEXT NULL,
  \`amount\` DECIMAL(10,2) NULL,
  \`created_by\` INT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_expenses_date\` (\`date\`)`,
    cols: [
      ['id', 'INT', I], ['date', 'DATE', D], ['category', 'VARCHAR', T],
      ['description', 'TEXT', T], ['amount', 'DECIMAL', DEC], ['created_by', 'INT', I],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'booking_requests',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`kind\` VARCHAR(32) NULL,
  \`slot_id\` INT NULL,
  \`booking_id\` INT NULL,
  \`player_id\` INT NULL,
  \`player_name\` VARCHAR(191) NULL,
  \`payload\` JSON NULL,
  \`status\` VARCHAR(32) NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  \`decided_by\` INT NULL,
  \`decided_at\` DATETIME(3) NULL,
  KEY \`ix_breq_status\` (\`status\`),
  KEY \`ix_breq_player\` (\`player_id\`)`,
    cols: [
      ['id', 'INT', I], ['kind', 'VARCHAR', T], ['slot_id', 'INT', I],
      ['booking_id', 'INT', I], ['player_id', 'INT', I], ['player_name', 'VARCHAR', T],
      ['payload', 'JSON', J], ['status', 'VARCHAR', T],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
      ['decided_by', 'INT', I], ['decided_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'payments',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`ref\` VARCHAR(32) NULL,
  \`date\` DATE NULL,
  \`player_name\` VARCHAR(191) NULL,
  \`player_id\` INT NULL,
  \`method\` VARCHAR(32) NULL,
  \`amount\` DECIMAL(10,2) NULL,
  \`private_sessions\` INT NULL DEFAULT 0,
  \`group_sessions\` INT NULL DEFAULT 0,
  \`notes\` TEXT NULL,
  \`status\` VARCHAR(32) NULL,
  \`booking_id\` INT NULL,
  \`created_by\` INT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  UNIQUE KEY \`uq_payments_ref\` (\`ref\`),
  KEY \`ix_payments_player\` (\`player_id\`),
  KEY \`ix_payments_booking\` (\`booking_id\`),
  KEY \`ix_payments_status\` (\`status\`)`,
    cols: [
      ['id', 'INT', I], ['ref', 'VARCHAR', T], ['date', 'DATE', D],
      ['player_name', 'VARCHAR', T], ['player_id', 'INT', I], ['method', 'VARCHAR', T],
      ['amount', 'DECIMAL', DEC], ['private_sessions', 'INT', I], ['group_sessions', 'INT', I],
      ['notes', 'TEXT', T], ['status', 'VARCHAR', T], ['booking_id', 'INT', I],
      ['created_by', 'INT', I], ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'audit_logs',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`timestamp\` DATETIME(3) NULL,
  \`actor_id\` INT NULL,
  \`actor_name\` VARCHAR(191) NULL,
  \`actor_role\` VARCHAR(64) NULL,
  \`ip\` VARCHAR(64) NULL,
  \`action\` VARCHAR(128) NULL,
  \`target_type\` VARCHAR(64) NULL,
  \`target_id\` VARCHAR(128) NULL,
  \`before\` LONGTEXT NULL,
  \`after\` LONGTEXT NULL,
  \`created_at\` DATETIME(3) NULL,
  \`updated_at\` DATETIME(3) NULL,
  KEY \`ix_audit_action\` (\`action\`),
  KEY \`ix_audit_actor\` (\`actor_id\`)`,
    cols: [
      ['id', 'INT', I], ['timestamp', 'DATETIME', DT], ['actor_id', 'INT', I],
      ['actor_name', 'VARCHAR', T], ['actor_role', 'VARCHAR', T], ['ip', 'VARCHAR', T],
      ['action', 'VARCHAR', T], ['target_type', 'VARCHAR', T], ['target_id', 'VARCHAR', TID],
      ['before', 'TEXT', T], ['after', 'TEXT', T],
      ['created_at', 'DATETIME', DT], ['updated_at', 'DATETIME', DT],
    ],
  },
  {
    name: 'court_defaults',
    ddl: `
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`court\` INT NULL,
  \`coach_id\` INT NULL,
  UNIQUE KEY \`uq_court_defaults_court\` (\`court\`)`,
    cols: [['id', 'INT', I], ['court', 'INT', I], ['coach_id', 'INT', I]],
  },
]

// ---------------------------------------------------------------------------
// Build SQL
// ---------------------------------------------------------------------------
const out = []
out.push('-- MM Padel Academy MySQL export')
out.push(`-- Source: ${DB_PATH}`)
out.push(`-- Generated: ${new Date().toISOString()}`)
out.push(`-- Rows: ${Object.entries(db).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 0}`).join(', ')}`)
out.push('')
out.push('CREATE DATABASE IF NOT EXISTS `mmacademy` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
out.push('USE `mmacademy`;')
out.push('')
out.push('SET NAMES utf8mb4;')
out.push('SET FOREIGN_KEY_CHECKS = 0;')
out.push('SET UNIQUE_CHECKS = 0;')
out.push('START TRANSACTION;')
out.push('')

const summary = []
const warnings = []

for (const table of TABLES) {
  const rows = Array.isArray(db[table.name]) ? db[table.name] : []
  out.push(`-- ------------------------------------------------------------------`)
  out.push(`-- Table: ${table.name} (${rows.length} rows)`)
  out.push(`-- ------------------------------------------------------------------`)
  out.push(`DROP TABLE IF EXISTS \`${table.name}\`;`)
  out.push(`CREATE TABLE \`${table.name}\` (${table.ddl}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  out.push('')

  // Warn about source fields with no destination column (data would be lost)
  if (rows.length > 0) {
    const known = new Set(table.cols.map((c) => c[0]))
    const extra = new Set()
    for (const r of rows) for (const k of Object.keys(r)) if (!known.has(k)) extra.add(k)
    if (extra.size > 0) warnings.push(`${table.name}: unmapped source fields ignored: ${[...extra].join(', ')}`)
  }

  if (rows.length === 0) {
    out.push(`-- (no rows for \`${table.name}\`)`)
    out.push('')
    summary.push([table.name, 0])
    continue
  }

  const colNames = table.cols.map((c) => `\`${c[0]}\``).join(', ')
  const CHUNK = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    out.push(`INSERT INTO \`${table.name}\` (${colNames}) VALUES`)
    const lines = chunk.map((row, idx) => {
      const vals = table.cols.map(([colName, type, conv]) => {
        let v
        try {
          v = conv(row[colName])
        } catch {
          v = null
        }
        if (type === 'JSON' && row[colName] !== null && row[colName] !== undefined && row[colName] !== '' && v === null) {
          warnings.push(`${table.name} id=${row.id}: invalid JSON in '${colName}' exported as NULL`)
        }
        return lit(type, v)
      })
      const comma = idx === chunk.length - 1 ? ';' : ','
      return `  (${vals.join(', ')})${comma}`
    })
    out.push(lines.join('\n'))
    inserted += chunk.length
  }
  out.push('')

  const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
  if (maxId > 0) out.push(`ALTER TABLE \`${table.name}\` AUTO_INCREMENT = ${maxId + 1};`)
  out.push('')
  summary.push([table.name, inserted])
}

// Generic fallback for any unexpected collections in the JSON (e.g. legacy `players`)
const knownTables = new Set(TABLES.map((t) => t.name))
for (const [key, val] of Object.entries(db)) {
  if (knownTables.has(key) || !Array.isArray(val) || val.length === 0) continue
  warnings.push(`Extra collection '${key}' (${val.length} rows) exported to generic table \`extra_${key}\` as JSON documents`)
  out.push(`-- Extra collection: ${key} (${val.length} rows, schemaless -> JSON)`)
  out.push(`DROP TABLE IF EXISTS \`extra_${key}\`;`)
  out.push(`CREATE TABLE \`extra_${key}\` (\n  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  \`doc\` JSON NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  out.push('')
  const CHUNK = 50
  for (let i = 0; i < val.length; i += CHUNK) {
    const chunk = val.slice(i, i + CHUNK)
    out.push(`INSERT INTO \`extra_${key}\` (\`doc\`) VALUES`)
    out.push(chunk.map((r, idx) => `  (CAST(${escStr(JSON.stringify(r))} AS JSON))${idx === chunk.length - 1 ? ';' : ','}`).join('\n'))
  }
  out.push('')
  summary.push([`extra_${key}`, val.length])
}

out.push('COMMIT;')
out.push('SET UNIQUE_CHECKS = 1;')
out.push('SET FOREIGN_KEY_CHECKS = 1;')
out.push('')

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, out.join('\n'), 'utf-8')

console.log('\nExport summary:')
for (const [t, n] of summary) console.log(`  ${t}: ${n} rows`)
if (warnings.length > 0) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ! ${w}`)
}
console.log(`\nWrote ${OUT_FILE}`)
