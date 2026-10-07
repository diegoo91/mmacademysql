// repair-slot-session-types.mjs — global historical fix for slots.session_type
//
// Why: missing/wrong session_type made genuine group sessions render & bill as
// private (Profile history, /users/:id/report, receipt PDF). Root causes: empty
// admin slots reused without a type, POST /slots defaulting to private, blank
// Session Type in schedule imports, booking-session edits collapsing player_text.
//
// Rules (approved for the backfill) live in src/utils/sessionType.js:
//   classifySlotRepair → ok | fix | skip | exception
// Only 'fix' rows are written. Conflicts/malformed rows are reported and left
// for manual admin correction. Balances, payments, bookings and player_text are
// never touched.
//
// Usage (from server/ so dotenv loads server/.env):
//   node repair-slot-session-types.mjs                    # local PG dry-run
//   node repair-slot-session-types.mjs --prod             # Supabase prod dry-run
//   node repair-slot-session-types.mjs --prod --apply     # backup + write + audit
//   node repair-slot-session-types.mjs --prod --apply --max 500  # safety cap
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { classifySlotRepair } from './src/utils/sessionType.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const maxIdx = process.argv.indexOf('--max')
const MAX = maxIdx > -1 ? parseInt(process.argv[maxIdx + 1], 10) : Infinity

// Target selection BEFORE db.js is imported (getKnex is lazy but keep it early).
if (PROD) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('ABORT: PROD_DATABASE_URL missing from server/.env')
    process.exit(1)
  }
}
const { default: db } = await import('./src/db.js')

console.log(`=== session_type repair — backend: ${db.backend} — target: ${PROD ? 'PROD (supabase pooler)' : 'local env'} — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`)

const slots = await db.findAll('slots')
console.log(`slots loaded: ${slots.length}`)

// Resolve bookings once (only those actually referenced).
const bookingIds = [...new Set(slots.map(s => s.booking_id).filter(Boolean))]
const bookings = new Map()
for (const id of bookingIds) {
  const b = await db.get('bookings', id)
  if (b) bookings.set(id, b)
}
console.log(`bookings referenced: ${bookingIds.length} (resolved ${bookings.size})`)

// Player lookup for the per-player breakdown.
const users = await db.findAll('users')
const byName = new Map(users.filter(u => u.name).map(u => [u.name.trim().toLowerCase(), u]))

const buckets = { ok: [], fix: [], skip: [], exception: [] }
const fixByPlayer = new Map()
const fixByStatus = new Map()

for (const slot of slots) {
  const booking = slot.booking_id ? bookings.get(slot.booking_id) || null : null
  const decision = classifySlotRepair({ slot, booking })
  const row = {
    id: slot.id, date: slot.date, time: slot.time, court: slot.court,
    status: slot.status, player_text: slot.player_text,
    current: slot.session_type ?? null, next: decision.next ?? null,
    reason: decision.reason, tier: decision.tier || null, booking_id: slot.booking_id || null,
    booking_type: booking?.session_type ?? null,
  }
  buckets[decision.action].push(row)

  if (decision.action === 'fix') {
    fixByStatus.set(slot.status || 'unknown', (fixByStatus.get(slot.status || 'unknown') || 0) + 1)
    for (const n of String(slot.player_text || '').split(/[/+]/).map(x => x.trim()).filter(Boolean)) {
      const u = byName.get(n.toLowerCase())
      const key = u ? `${u.name} (id ${u.id})` : `${n} [unmatched]`
      fixByPlayer.set(key, (fixByPlayer.get(key) || 0) + 1)
    }
  }
}

const tally = (rows) => rows.length
console.log('\n--- summary ---')
console.log(`ok (already correct): ${tally(buckets.ok)}`)
console.log(`skip (leave as-is) : ${tally(buckets.skip)}`)
console.log(`fix  (safe)        : ${tally(buckets.fix)}`)
console.log(`exception (manual) : ${tally(buckets.exception)}`)

const byTier = { 'booking-link': 0, 'player-count': 0 }
for (const r of buckets.fix) byTier[r.tier] = (byTier[r.tier] || 0) + 1
if (buckets.fix.length) {
  console.log('\nfix breakdown:')
  console.log(`  by tier    : ${JSON.stringify(byTier)}`)
  console.log(`  by status  : ${JSON.stringify(Object.fromEntries(fixByStatus))}`)
  const byChange = {}
  for (const r of buckets.fix) {
    const k = `${r.current ?? 'NULL'} -> ${r.next}`
    byChange[k] = (byChange[k] || 0) + 1
  }
  console.log(`  by change  : ${JSON.stringify(byChange)}`)
  console.log(`  by player  : ${JSON.stringify(Object.fromEntries([...fixByPlayer].sort((a, b) => b[1] - a[1])))}`)
}

if (buckets.skip.length) {
  const reasons = {}
  for (const r of buckets.skip) reasons[r.reason] = (reasons[r.reason] || 0) + 1
  console.log('\nskip breakdown:')
  for (const [k, v] of Object.entries(reasons)) console.log(`  ${v} × ${k}`)
}

if (buckets.exception.length) {
  console.log('\nEXCEPTIONS (left unchanged — manual admin review):')
  for (const r of buckets.exception) {
    console.log(`  slot ${r.id} ${r.date} ${r.time} C${r.court} [${r.status}] "${r.player_text}" type=${r.current ?? 'NULL'} booking=${r.booking_id ?? '-'}(${r.booking_type ?? '-'}) — ${r.reason}`)
  }
}

if (!APPLY) {
  console.log('\nDRY-RUN — no rows written. Re-run with --apply to write the "fix" rows.')
  await db.close?.()
  process.exit(0)
}

const fixes = buckets.fix
if (fixes.length === 0) {
  console.log('\nnothing to fix — database already consistent.')
  await db.close?.()
  process.exit(0)
}
if (fixes.length > MAX) {
  console.error(`\nABORT: ${fixes.length} fixes exceed --max ${MAX}. Review the dry-run output first.`)
  await db.close?.()
  process.exit(1)
}

// ── Backup before any write ────────────────────────────────────────────────
const backupDir = join(__dirname, 'data', 'backups')
mkdirSync(backupDir, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = join(backupDir, `session-type-repair-${ts}.json`)
try {
  const dump = db.backend === 'json'
    ? JSON.parse(readFileSync(join(__dirname, 'data', 'academy.db.json'), 'utf8'))
    : await db.exportAll()
  writeFileSync(backupPath, JSON.stringify(dump, null, 2))
  console.log(`\nbackup written: ${backupPath}`)
} catch (err) {
  console.error(`\nABORT: backup failed (${err.message}) — nothing was written.`)
  await db.close?.()
  process.exit(1)
}

// ── Apply + audit in one transaction ───────────────────────────────────────
const auditRows = []
const stampIso = new Date().toISOString()
const actorName = 'repair-slot-session-types'
const auditRow = (r) => ({
  request_id: null,
  timestamp: stampIso,
  actor_id: null,
  actor_name: actorName,
  actor_role: 'system',
  ip: 'local-script',
  action: 'session_type.repair',
  target_type: 'slot',
  target_id: r.id,
  before: JSON.stringify({ session_type: r.current }),
  after: JSON.stringify({ session_type: r.next, tier: r.tier, reason: r.reason }),
  status_code: null,
  duration_ms: null,
  request_body: null,
  error: null,
})

try {
  await db.transaction(async (tx) => {
    for (const r of fixes) {
      await tx.update('slots', r.id, { session_type: r.next })
      auditRows.push(auditRow(r))
    }
    for (const a of auditRows) await tx.insert('audit_logs', a)
  })
} catch (err) {
  console.error(`\nAPPLY FAILED: ${err.message}`)
  console.error(`rolled back — restore from ${backupPath} if anything looks wrong.`)
  await db.close?.()
  process.exit(1)
}

console.log(`\napplied ${fixes.length} corrections, ${auditRows.length} audit entries written.`)
console.log(`exceptions left for manual review: ${buckets.exception.length}`)
await db.close?.()
process.exit(0)
