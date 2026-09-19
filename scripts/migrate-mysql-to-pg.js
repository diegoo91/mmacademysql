#!/usr/bin/env node
/**
 * Migrate data from MySQL (localhost:5175) → PostgreSQL (localhost:5432).
 * Reads all 13 tables from MySQL, maps column names to pg conventions,
 * inserts into pg, verifies row counts.
 *
 * Usage:
 *   node scripts/migrate-mysql-to-pg.js
 *   node scripts/migrate-mysql-to-pg.js --dry-run
 */
import mysql from '../server/node_modules/mysql2/promise.js'
import pg from '../server/node_modules/pg/lib/index.js'

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')

const MYSQL_CFG = { host: 'localhost', port: 5175, user: 'root', password: 'root', database: 'mmacademy' }
const PG_CFG = { host: 'localhost', port: 5432, user: 'postgres', password: 'root', database: 'mmacademy' }

// MySQL table → pg column mapping (only differs where pg renames columns)
// [mysql_col, pg_col] — null means same name
const TABLE_MAP = {
  users: {
    cols: [
      ['id', 'user_id'], ['name', null], ['email', null], ['phone', null], ['dob', null],
      ['password_hash', null], ['role', null], ['skill_level', null], ['member_since', null],
      ['force_password_change', null], ['member_code', null], ['is_claimed', null],
      ['private_balance', null], ['group_balance', null], ['balance_zero_since', null],
      ['notes', null], ['position', null], ['avatar', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['uuid', 'user_code', 'created_by', 'updated_by'],
  },
  results: {
    cols: [
      ['id', null], ['date', null], ['format', null],
      ['sideA', 'sidea'], ['sideB', 'sideb'],
      ['side_a', null], ['side_b', null],
      ['player_a', null], ['player_b', null], ['score_a', null], ['score_b', null],
      ['score_side_a', null], ['score_side_b', null], ['score_text', null],
      ['winner_side', null], ['winner', null], ['status', null], ['submitted_by', null],
      ['court', null], ['court_time', null], ['competition', null], ['notes', null],
      ['import_batch', null], ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  slots: {
    cols: [
      ['id', null], ['date', null], ['time', null], ['court', null],
      ['player_text', null], ['booking_id', null], ['user_id', null],
      ['session_type', null], ['status', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['player_name_1', 'player_name_2', 'created_by', 'updated_by'],
  },
  bookings: {
    cols: [
      ['id', null], ['ref', null], ['user_id', null], ['session_type', null], ['mode', null],
      ['sessions_json', null], ['sessions', null], ['total', null], ['status', null],
      ['player_name', null], ['private_remaining', null], ['group_remaining', null],
      ['deducted_from', null], ['deducted_count', null],
      ['paid', null], ['amount_paid', null], ['payment_method', null], ['payment_date', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  import_batches: {
    cols: [
      ['id', null], ['kind', null], ['filename', null], ['row_count', null],
      ['error_count', null], ['by_user', null], ['status', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  comments: {
    cols: [
      ['id', null], ['user_id', null], ['user_name', null], ['text', null],
      ['rating', null], ['status', null], ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  notifications: {
    cols: [
      ['id', null], ['user_id', null], ['kind', null], ['title', null],
      ['body', null], ['link', null], ['read', 'is_read'],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  conversion_requests: {
    cols: [
      ['id', null], ['user_id', null], ['user_name', null],
      ['from', 'from_type'], ['to', 'to_type'],
      ['count', null], ['status', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  expenses: {
    cols: [
      ['id', null], ['date', null], ['category', null], ['description', null],
      ['amount', null], ['created_by', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  booking_requests: {
    cols: [
      ['id', null], ['kind', null], ['slot_id', null], ['booking_id', null],
      ['player_id', null], ['player_name', null], ['payload', null],
      ['status', null], ['decided_by', null], ['decided_at', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  payments: {
    cols: [
      ['id', null], ['ref', null], ['date', null], ['player_name', null],
      ['player_id', null], ['method', null], ['amount', null],
      ['private_sessions', null], ['group_sessions', null], ['notes', null],
      ['status', null], ['booking_id', null], ['created_by', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  audit_logs: {
    cols: [
      ['id', null], ['request_id', null], ['timestamp', null], ['method', null],
      ['path', null], ['query_string', null], ['actor_id', null], ['actor_name', null],
      ['actor_role', null], ['ip', null], ['user_agent', null],
      ['action', null], ['target_type', null], ['target_id', null],
      ['status_code', null], ['duration_ms', null], ['request_body', null],
      ['before', 'rec_before'], ['after', 'rec_after'], ['error', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
  court_defaults: {
    cols: [
      ['id', null], ['court', null], ['coach_id', null],
      ['created_at', null], ['updated_at', null],
    ],
    skipCols: ['created_by', 'updated_by'],
  },
}

// FKs to validate after load
const FK_REFS = {
  import_batches: { by_user: 'users' },
  results: { submitted_by: 'users', import_batch: 'import_batches' },
  bookings: { user_id: 'users', import_batch: 'import_batches' },
  slots: { booking_id: 'bookings', user_id: 'users' },
  comments: { user_id: 'users' },
  notifications: { user_id: 'users' },
  conversion_requests: { user_id: 'users' },
  expenses: { created_by: 'users' },
  booking_requests: { slot_id: 'slots', booking_id: 'bookings', player_id: 'users', decided_by: 'users' },
  payments: { player_id: 'users', booking_id: 'bookings', created_by: 'users' },
  court_defaults: { coach_id: 'users' },
}

// Dependency order for loading (parents first)
const LOAD_ORDER = [
  'users', 'import_batches', 'results', 'bookings', 'slots',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'audit_logs', 'court_defaults',
]

function mapRow(table, mysqlRow) {
  const t = TABLE_MAP[table]
  const pgRow = {}
  for (const [mysqlCol, pgCol] of t.cols) {
    const target = pgCol || mysqlCol
    let val = mysqlRow[mysqlCol]
    if (Buffer.isBuffer(val)) val = null
    // mysql2 auto-parses JSON → JS object; pg needs JSON string for JSONB columns
    if (val !== null && typeof val === 'object') val = JSON.stringify(val)
    pgRow[target] = val
  }
  return pgRow
}

async function main() {
  console.log('MySQL → PostgreSQL migration')
  console.log(`  MySQL: ${MYSQL_CFG.host}:${MYSQL_CFG.port}/${MYSQL_CFG.database}`)
  console.log(`  Pg:    ${PG_CFG.host}:${PG_CFG.port}/${PG_CFG.database}`)
  if (DRY_RUN) console.log('  Mode: DRY RUN (no writes)\n')

  const my = await mysql.createConnection(MYSQL_CFG)
  const pgPool = new pg.Pool(PG_CFG)

  // Read all MySQL tables
  console.log('Reading MySQL...')
  const mysqlData = {}
  for (const table of LOAD_ORDER) {
    const [rows] = await my.query(`SELECT * FROM \`${table}\``)
    mysqlData[table] = rows
    console.log(`  ${table}: ${rows.length} rows`)
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: no writes. Exiting.')
    await my.end()
    await pgPool.end()
    return
  }

  // Truncate pg tables in reverse order
  console.log('\nTruncating pg tables...')
  for (const table of [...LOAD_ORDER].reverse()) {
    await pgPool.query(`TRUNCATE TABLE "${table}" CASCADE`)
  }

  // Insert into pg
  console.log('\nInserting into pg...')
  let totalRows = 0
  const mismatches = []

  for (const table of LOAD_ORDER) {
    const rows = mysqlData[table]
    if (!rows.length) {
      console.log(`  ${table}: 0 rows (skipped)`)
      continue
    }

    const pgRows = rows.map(r => mapRow(table, r))
    const pgCols = Object.keys(pgRows[0])

    // Insert in chunks of 100
    for (let i = 0; i < pgRows.length; i += 100) {
      const chunk = pgRows.slice(i, i + 100)
      const placeholders = chunk.map((_, ri) =>
        `(${pgCols.map((_, ci) => `$${ri * pgCols.length + ci + 1}`).join(', ')})`
      ).join(', ')
      const values = chunk.flatMap(r => pgCols.map(c => r[c] === undefined ? null : r[c]))
      await pgPool.query(
        `INSERT INTO "${table}" (${pgCols.join(', ')}) VALUES ${placeholders}`,
        values
      )
    }

    // Verify count
    const { rows: [{ count }] } = await pgPool.query(`SELECT COUNT(*)::int FROM "${table}"`)
    const match = count === rows.length
    console.log(`  ${table}: ${count} rows ${match ? 'ok' : `MISMATCH (mysql=${rows.length})`}`)
    if (!match) mismatches.push(table)
    totalRows += count
  }

  // Reset sequences
  console.log('\nResetting sequences...')
  for (const table of LOAD_ORDER) {
    const t = TABLE_MAP[table]
    const pkCol = t.cols.find(([m, p]) => (p || m) === 'user_id' || (p || m) === 'id')
    const pk = pkCol ? (pkCol[1] || pkCol[0]) : 'id'
    await pgPool.query(`SELECT setval(pg_get_serial_sequence('${table}', '${pk}'), COALESCE((SELECT MAX("${pk}") FROM "${table}"), 1))`)
  }

  console.log(`\nDone. ${totalRows} total rows loaded into pg.`)
  if (mismatches.length) {
    console.log(`MISMATCHES: ${mismatches.join(', ')}`)
    process.exit(1)
  }

  await my.end()
  await pgPool.end()
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
