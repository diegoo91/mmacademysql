/** Read-only: emit markdown tables of never-deducted slots (Ammar/Aley class). */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const ROOT = 'D:/SQL/mm-padel-academy mysql'
function parseEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
async function main() {
  const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
  const c = new Client({
    host: u.hostname, port: Number(u.port) || 6543,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, statement_timeout: 60000,
  })
  await c.connect()
  const q = async (sql) => {
    if (!/^\s*(select|with)/i.test(sql)) throw new Error('NON-SELECT blocked')
    return (await c.query(sql)).rows
  }
  try {
    const users = await q(`SELECT user_id AS id, name, private_balance, group_balance,
      cycle_private, cycle_group, cycle_expires_at FROM users WHERE role='player'`)
    const slots = await q(`SELECT id, date::text AS date, time, session_type, player_text,
      balance_status, booking_id FROM slots
      WHERE status='player_confirmed' AND player_text <> '' ORDER BY date, time`)
    const bookings = await q(`SELECT id, session_type FROM bookings`)
    const payments = await q(`SELECT id, player_id, status, private_sessions, group_sessions,
      credited_private, credited_group FROM payments WHERE status='payment_approved'`)

    const now = new Date()
    const expired = (x) => x.cycle_expires_at && new Date(x.cycle_expires_at) < now
    const effP = (x) => Math.max(0, x.private_balance || 0) + (expired(x) ? 0 : Math.max(0, x.cycle_private || 0))
    const effG = (x) => Math.max(0, x.group_balance || 0) + Math.max(0, x.private_balance || 0) * 2 +
      (expired(x) ? 0 : Math.max(0, x.cycle_group || 0) + Math.max(0, x.cycle_private || 0) * 2)
    const byName = new Map(users.map(x => [(x.name || '').toLowerCase(), x]))
    const bt = new Map(bookings.map(b => [b.id, b.session_type]))
    const pay = new Map()
    for (const p of payments) {
      if (!p.player_id) continue
      if (!pay.has(p.player_id)) pay.set(p.player_id, { p: 0, g: 0 })
      const a = pay.get(p.player_id)
      if (p.credited_private != null || p.credited_group != null) {
        a.p += Math.max(0, p.credited_private || 0); a.g += Math.max(0, p.credited_group || 0)
      } else { a.p += p.private_sessions || 0; a.g += p.group_sessions || 0 }
    }

    const rows = []
    const usedAgg = new Map()
    for (const s of slots) {
      const cand = s.balance_status === null || s.balance_status === 'shortfall'
      const names = (s.player_text || '').split(/[/+]/).map(n => n.trim()).filter(Boolean)
      for (const n of names) {
        const x = byName.get(n.toLowerCase())
        if (!x) continue
        let type = s.session_type || (s.booking_id ? bt.get(s.booking_id) : null) || 'private'
        if (!usedAgg.has(x.id)) usedAgg.set(x.id, { p: 0, g: 0 })
        const ua = usedAgg.get(x.id)
        if (type === 'group') ua.g++; else ua.p++
        if (cand) rows.push({ player: x.name, id: x.id, slot: s.id, date: s.date.slice(0, 10), time: s.time, type, bs: s.balance_status })
      }
    }

    const candIds = new Map()
    for (const r of rows) candIds.set(r.id, (candIds.get(r.id) || 0) + 1)

    console.log('TABLE1')
    console.log('| # | Player | id | Eff P | Eff G | Never-deducted | Paid P | Paid G | Used P | Used G |')
    console.log('|---|--------|----|-------|-------|----------------|--------|--------|--------|--------|')
    let i = 0
    const seen = new Set()
    const sorted = [...rows].sort((a, b) => a.player.localeCompare(b.player))
    for (const r of sorted) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      const x = users.find(y => y.id === r.id)
      const pa = pay.get(r.id) || { p: 0, g: 0 }
      const ua = usedAgg.get(r.id) || { p: 0, g: 0 }
      i++
      console.log(`| ${i} | ${x.name} | ${r.id} | ${effP(x)} | ${effG(x)} | ${candIds.get(r.id)} | ${pa.p} | ${pa.g} | ${ua.p} | ${ua.g} |`)
    }
    console.log('')
    console.log('TABLE2')
    console.log('| Player | Slot | Date | Time | Type | balance_status |')
    console.log('|--------|------|------|------|------|----------------|')
    for (const r of sorted) console.log(`| ${r.player} | ${r.slot} | ${r.date} | ${r.time} | ${r.type} | ${r.bs === 'shortfall' ? 'shortfall' : 'NULL'} |`)
  } finally { await c.end() }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
