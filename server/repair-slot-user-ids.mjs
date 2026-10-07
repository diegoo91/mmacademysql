// repair-slot-user-ids.mjs — historical fix for stale slots.user_id
//
// Why: editing an occupied slot's player_text (admin swap) never re-resolved
// user_id, so the slot stayed linked to the previous player. Effects: the slot
// showed on the wrong player's Profile (uid match), and confirm/approve
// notifications targeted the wrong player (slots.js notify paths prefer uid).
// player_text is the source of truth for who plays (reports/journey/results).
//
// Rules:
//   user_id NULL                      → ok (name matching covers the players)
//   uid holder's name in player_text  → ok
//   otherwise                          → fix: uid := first-name of player_text
//                                        resolved to a player account, else NULL
// player_text, session_type, balances and payments are never touched.
//
// Usage (from server/ so dotenv loads server/.env):
//   node repair-slot-user-ids.mjs                    # local PG dry-run
//   node repair-slot-user-ids.mjs --prod             # Supabase prod dry-run
//   node repair-slot-user-ids.mjs --prod --apply     # backup + write + audit
//   node repair-slot-user-ids.mjs --prod --apply --max 500
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const maxIdx = process.argv.indexOf('--max')
const MAX = maxIdx > -1 ? parseInt(process.argv[maxIdx + 1], 10) : Infinity

if (PROD) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('ABORT: PROD_DATABASE_URL missing from server/.env')
    process.exit(1)
  }
}
const { default: db } = await import('./src/db.js')

console.log(`=== user_id repair — backend: ${db.backend} — target: ${PROD ? 'PROD (supabase pooler)' : 'local env'} — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`)

const slots = await db.findAll('slots')
const users = await db.findAll('users')
const byId = new Map(users.map(u => [u.id, u]))
const byName = new Map(users.filter(u => u.name).map(u => [u.name.trim().toLowerCase(), u]))
console.log(`slots loaded: ${slots.length} — users: ${users.length}`)

const splitNames = (text) => String(text || '').split(/[/+]/).map(n => n.trim()).filter(Boolean)

const buckets = { ok: [], fix: [], exception: [] }

for (const slot of slots) {
  if (slot.user_id == null) {
    buckets.ok.push({ id: slot.id, reason: 'uid null' })
    continue
  }
  const holder = byId.get(slot.user_id)
  const names = splitNames(slot.player_text)
  const namesLower = names.map(n => n.toLowerCase())

  if (names.length === 0) {
    buckets.fix.push({
      id: slot.id, date: slot.date, time: slot.time, court: slot.court,
      player_text: slot.player_text, status: slot.status,
      from: slot.user_id, fromName: holder ? holder.name : `[dangling id ${slot.user_id}]`,
      to: null, toName: null, reason: 'orphan uid on open slot',
    })
    continue
  }
  if (holder && namesLower.includes(String(holder.name).trim().toLowerCase())) {
    buckets.ok.push({ id: slot.id, reason: 'uid in player_text' })
    continue
  }
  if (!holder) {
    const first = names[0].toLowerCase()
    const target = byName.get(first) || null
    buckets.fix.push({
      id: slot.id, date: slot.date, time: slot.time, court: slot.court,
      player_text: slot.player_text, status: slot.status,
      from: slot.user_id, fromName: `[dangling id ${slot.user_id}]`,
      to: target ? target.id : null, toName: target ? target.name : null,
      reason: 'dangling uid',
    })
    continue
  }
  if (holder.role !== 'player') {
    buckets.exception.push({
      id: slot.id, date: slot.date, time: slot.time, court: slot.court,
      player_text: slot.player_text, status: slot.status,
      from: slot.user_id, fromName: `${holder.name} [role=${holder.role}]`,
      reason: 'uid holder is not a player account',
    })
    continue
  }
  const first = names[0].toLowerCase()
  const target = byName.get(first) || null
  buckets.fix.push({
    id: slot.id, date: slot.date, time: slot.time, court: slot.court,
    player_text: slot.player_text, status: slot.status,
    from: slot.user_id, fromName: holder.name,
    to: target ? target.id : null, toName: target ? target.name : null,
    reason: 'holder not in player_text (swap left stale uid)',
  })
}

console.log('\n--- summary ---')
console.log(`ok (already correct): ${buckets.ok.length}`)
console.log(`fix  (safe)        : ${buckets.fix.length}`)
console.log(`exception (manual) : ${buckets.exception.length}`)

if (buckets.fix.length) {
  console.log('\nfix rows:')
  for (const r of buckets.fix) {
    console.log(`  slot ${r.id} ${r.date} ${r.time} C${r.court} [${r.status}] "${r.player_text}" — uid ${r.from}(${r.fromName}) -> ${r.to ?? 'NULL'}(${r.toName ?? '-'}) — ${r.reason}`)
  }
}
if (buckets.exception.length) {
  console.log('\nEXCEPTIONS (left unchanged — manual admin review):')
  for (const r of buckets.exception) {
    console.log(`  slot ${r.id} ${r.date} ${r.time} C${r.court} "${r.player_text}" uid=${r.from}(${r.fromName}) — ${r.reason}`)
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

const backupDir = join(__dirname, 'data', 'backups')
mkdirSync(backupDir, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = join(backupDir, `user-id-repair-${ts}.json`)
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

const auditRows = []
const stampIso = new Date().toISOString()
const auditRow = (r) => ({
  request_id: null,
  timestamp: stampIso,
  actor_id: null,
  actor_name: 'repair-slot-user-ids',
  actor_role: 'system',
  ip: 'local-script',
  action: 'user_id.repair',
  target_type: 'slot',
  target_id: r.id,
  before: JSON.stringify({ user_id: r.from }),
  after: JSON.stringify({ user_id: r.to, reason: r.reason }),
  status_code: null,
  duration_ms: null,
  request_body: null,
  error: null,
})

try {
  await db.transaction(async (tx) => {
    for (const r of fixes) {
      await tx.update('slots', r.id, { user_id: r.to })
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
