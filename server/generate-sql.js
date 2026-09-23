import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const jsonPath = join(__dirname, 'data', 'academy.db.json')
const data = JSON.parse(readFileSync(jsonPath, 'utf-8'))

const BOOL_COLS = new Set(['is_claimed', 'force_password_change', 'is_read'])
const JSON_COLS = new Set(['sideA', 'sideB', 'sideA_ids', 'sideB_ids', 'payload', 'rec_before', 'rec_after', 'permissions', 'sessions_json'])

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  const s = String(v).replace(/'/g, "''")
  return `'${s}'`
}

function jsonCol(v) {
  if (v === null || v === undefined) return 'NULL'
  return `${esc(JSON.stringify(v))}::jsonb`
}

// Column mappings: JSON key -> PG column
const COL_MAP = {
  users: {
    id: 'user_id',
  }
}

const PG_ORDER = {
  users: ['user_id','uuid','user_code','name','email','phone','dob','password_hash','role','skill_level','member_since','force_password_change','member_code','is_claimed','private_balance','group_balance','balance_zero_since','notes','account_status','position','avatar','created_by','created_at','updated_by','updated_at'],
  slots: ['id','date','time','court','player_name_1','player_name_2','player_text','booking_id','user_id','session_type','status','balance_status','coach_id','created_by','created_at','updated_by','updated_at'],
  bookings: ['id','ref','user_id','session_type','mode','sessions_json','sessions','total','status','player_name','private_remaining','group_remaining','deducted_from','deducted_count','paid','amount_paid','payment_method','payment_date','import_batch','created_by','created_at','updated_by','updated_at'],
  results: ['id','date','format','sideA','sideB','sideA_ids','sideB_ids','side_a','side_b','player_a','player_b','score_a','score_b','score_side_a','score_side_b','score_text','winner_side','winner','status','submitted_by','court','court_time','competition','notes','import_batch','created_by','created_at','updated_by','updated_at'],
  import_batches: ['id','kind','filename','row_count','error_count','by_user','status','created_by','created_at','updated_by','updated_at'],
  comments: ['id','user_id','user_name','text','rating','status','created_by','created_at','updated_by','updated_at'],
  notifications: ['id','user_id','kind','title','body','link','is_read','created_by','created_at','updated_by','updated_at'],
  conversion_requests: ['id','user_id','user_name','from_type','to_type','count','status','created_by','created_at','updated_by','updated_at'],
  expenses: ['id','date','category','description','amount','created_by','created_at','updated_by','updated_at'],
  booking_requests: ['id','kind','slot_id','booking_id','player_id','player_name','payload','status','decided_by','decided_at','created_by','created_at','updated_by','updated_at'],
  payments: ['id','ref','date','player_name','player_id','method','amount','private_sessions','group_sessions','notes','status','booking_id','created_by','created_at','updated_by','updated_at'],
  audit_logs: ['id','request_id','timestamp','method','path','query_string','actor_id','actor_name','actor_role','ip','user_agent','action','target_type','target_id','status_code','duration_ms','request_body','rec_before','rec_after','error','created_by','created_at','updated_by','updated_at'],
  court_defaults: ['id','court','coach_id','created_by','created_at','updated_by','updated_at'],
  roles: ['id','name','display_name','level','permissions','is_system','created_at','updated_at'],
}

const TABLES = [
  'users', 'roles', 'import_batches', 'bookings', 'slots', 'results',
  'comments', 'notifications', 'conversion_requests', 'expenses',
  'booking_requests', 'payments', 'audit_logs', 'court_defaults'
]

let sql = `-- MM Padel Academy data migration
-- Paste into Supabase SQL Editor and run
-- Generated from academy.db.json

-- Drop check constraints temporarily
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_private_balance;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_group_balance;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payment_amount;

`

for (const table of TABLES) {
  const rows = data[table] || []
  if (rows.length === 0) continue

  const map = COL_MAP[table] || {}
  const order = PG_ORDER[table] || Object.keys(rows[0]).map(k => map[k] || k)

  // Filter to columns that exist in at least one row
  const allKeys = new Set()
  for (const r of rows) for (const k of Object.keys(r)) allKeys.add(map[k] || k)
  const cols = order.filter(c => allKeys.has(c))

  for (const row of rows) {
    const mapped = {}
    for (const [k, v] of Object.entries(row)) {
      mapped[map[k] || k] = v
    }
    // Clamp negative balances to 0 (app handles them as 0)
    if (mapped.private_balance !== undefined && mapped.private_balance < 0) mapped.private_balance = 0
    if (mapped.group_balance !== undefined && mapped.group_balance < 0) mapped.group_balance = 0
    const vals = cols.map(c => {
      const v = mapped[c]
      if (JSON_COLS.has(c)) return jsonCol(v)
      if (c === 'is_system') return v ? 'TRUE' : 'FALSE'
      if (typeof v === 'boolean') return v ? '1' : '0'
      return esc(v)
    })
    sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`
  }
  sql += `\n`
}

// Reset sequences
sql += `-- Reset sequences\n`
for (const table of TABLES) {
  const pk = table === 'users' ? 'user_id' : 'id'
  sql += `SELECT setval(pg_get_serial_sequence('${table}', '${pk}'), COALESCE((SELECT MAX(${pk}) FROM ${table}), 1));\n`
}

sql += `\n-- Re-add check constraints\n`
sql += `ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payment_amount;\n`
sql += `ALTER TABLE payments ADD CONSTRAINT chk_payment_amount CHECK (amount >= 0);\n`

const outPath = join(__dirname, 'data', 'migrate.sql')
writeFileSync(outPath, sql)
console.log(`Generated ${outPath} (${sql.length} bytes)`)
console.log(`Tables: ${TABLES.filter(t => (data[t] || []).length > 0).map(t => `${t}(${(data[t]||[]).length})`).join(', ')}`)
