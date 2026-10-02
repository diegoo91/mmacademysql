/**
 * Coach daily hours upsert — 2026-10-01 (Laila + Omar).
 * 1) backup coach_daily_hours  2) txn upsert rows + audit_logs  3) verify
 * Run: node _apply-coach-hours.mjs   (uses PROD_DATABASE_URL)
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
process.env.DB_ENABLED = 'true'
const LOCAL = process.argv.includes('--local')
if (!LOCAL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { default: db } = await import('./src/db.js')

const NOTE = 'Backfill 2026-10-01'
const ENTRIES = [
  { coach_id: 36, date: '2026-09-26', hours: 6 },
  { coach_id: 36, date: '2026-09-27', hours: 4 },
  { coach_id: 36, date: '2026-09-30', hours: 6 },
  { coach_id: 37, date: '2026-09-26', hours: 6 },
  { coach_id: 37, date: '2026-09-29', hours: 6 },
]
console.log(`target: ${LOCAL ? 'LOCAL (localhost)' : 'PROD (supabase)'}`)

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const users = await db.findAll('users')
const coaches = Object.fromEntries(users.filter(u => u.role === 'coach').map(u => [u.id, u.name]))
const actor = users.find(u => u.role === 'superadmin') || users.find(u => u.role === 'admin')
for (const e of ENTRIES) {
  if (!coaches[e.coach_id]) throw new Error(`coach_id ${e.coach_id} is not a coach`)
}
console.log(`actor: #${actor?.id} ${actor?.name} (${actor?.role})`)

// 1) backup
const before = await db.findAll('coach_daily_hours')
const backupDir = path.resolve('..', 'scripts', 'payments-backups')
const backupFile = path.join(backupDir, `coach-daily-hours${LOCAL ? '-local' : ''}-${stamp}.json`)
fs.writeFileSync(backupFile, JSON.stringify({ backed_up_at: new Date().toISOString(), rows: before }, null, 2))
console.log(`backup: ${backupFile} (${before.length} rows)`)

// 2) apply
const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
const results = await db.transaction(async (tx) => {
  const out = []
  for (const e of ENTRIES) {
    const existing = await tx.find('coach_daily_hours', h => h.coach_id === e.coach_id && h.date === e.date)
    if (existing) {
      await tx.update('coach_daily_hours', existing.id, { hours: e.hours, notes: NOTE, updated_at: ts })
      await tx.insert('audit_logs', {
        request_id: null, timestamp: ts, actor_id: actor?.id ?? null, actor_name: actor?.name || 'system',
        actor_role: actor?.role || 'system', ip: '127.0.0.1', action: 'update',
        target_type: 'coach_daily_hours', target_id: existing.id,
        before: JSON.stringify({ coach_id: existing.coach_id, date: existing.date, hours: existing.hours, notes: existing.notes }),
        after: JSON.stringify({ coach_id: e.coach_id, date: e.date, hours: e.hours, notes: NOTE }),
      })
      out.push(`UPDATE #${existing.id} ${coaches[e.coach_id]} ${e.date} ${existing.hours}h -> ${e.hours}h`)
    } else {
      const created = await tx.insert('coach_daily_hours', {
        coach_id: e.coach_id, date: e.date, hours: e.hours, notes: NOTE, source: 'admin',
        created_at: ts, updated_at: ts,
      })
      const newId = created?.id ?? created
      await tx.insert('audit_logs', {
        request_id: null, timestamp: ts, actor_id: actor?.id ?? null, actor_name: actor?.name || 'system',
        actor_role: actor?.role || 'system', ip: '127.0.0.1', action: 'create',
        target_type: 'coach_daily_hours', target_id: newId, before: null,
        after: JSON.stringify({ coach_id: e.coach_id, date: e.date, hours: e.hours, notes: NOTE }),
      })
      out.push(`INSERT #${newId} ${coaches[e.coach_id]} ${e.date} ${e.hours}h`)
    }
  }
  return out
})
console.log('--- applied ---')
results.forEach(r => console.log('  ' + r))

// 3) verify
console.log('--- verify: target rows ---')
const after = await db.findAll('coach_daily_hours')
for (const e of ENTRIES) {
  const r = after.find(h => h.coach_id === e.coach_id && h.date === e.date)
  const ok = r && Number(r.hours) === e.hours
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${coaches[e.coach_id]} ${e.date} = ${r?.hours ?? 'MISSING'}h (want ${e.hours}h) row#${r?.id}`)
}
console.log('--- totals Sep 20-30 ---')
for (const [id, name] of Object.entries(coaches)) {
  const rows = after.filter(h => h.coach_id === Number(id) && h.date >= '2026-09-20' && h.date <= '2026-09-30')
  const total = rows.reduce((s, h) => s + Number(h.hours), 0)
  console.log(`  ${name}: ${rows.length} rows, ${total}h  [${rows.map(r => `${r.date.slice(5)}=${r.hours}`).join(' ')}]`)
}
await db.close?.()
process.exit(0)
