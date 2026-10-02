/**
 * PRODUCTION — unpaid sessions → package-priced payment records (approved, Cash),
 * per user instruction 2026-09-30: "check package and calculate for them what
 * they should pay as per package ... commit direct to update the unpaid sessions".
 *
 * For each player: owedP/owedG = per-type deficit (used − paid) after cross-type
 * coverage (1P = 2G), priced via PRICING.calculatePrice (greedy bundles) —
 * GUARD: Farida must compute exactly 14000 + 1500 = 15,500.
 *
 * Per player with owed > 0:
 *   1. INSERT payments row: status='payment_approved', method='Cash',
 *      sessions=owed, amount=package price, credited_/settled_ columns NULL
 *      (balance untouched — the credit offsets the already-consumed sessions,
 *       net 0; no creditCycle call → no settlement side effects)
 *   2. Their never-deducted used slots (NULL/'shortfall') → 'deducted'
 *      (now backed by the payment record → refund-safe on future cancel)
 *   3. audit rows for both actions
 * Safety: single tx; asserts on every step; Farida assert pre-COMMIT; ROLLBACK on any failure.
 */
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

// Exact copy of src/data/pricingData.js PRICING + calculatePrice (greedy)
const PRICING = {
  private: { 1: 1000, 4: 3600, 8: 7000, 12: 10800, 16: 14000 },
  group: { 1: 500, 4: 1800, 8: 3500, 16: 7000 },
}
function calculatePrice(type, sessionCount) {
  const tier = PRICING[type]
  if (!tier) return 0
  if (tier[sessionCount] !== undefined) return tier[sessionCount]
  const tiers = Object.keys(tier).map(Number).filter(k => !isNaN(k) && k !== 1).sort((a, b) => b - a)
  let remaining = sessionCount, total = 0
  for (const t of tiers) {
    while (remaining >= t) { remaining -= t; total += tier[t] }
  }
  total += remaining * tier[1]
  return total
}

const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
const cfg = {
  host: u.hostname, port: Number(u.port) || 6543,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
}
function expect(label, rowCount, want) {
  if (rowCount !== want) throw new Error(`GUARD FAILED: ${label} affected ${rowCount} rows, expected ${want}`)
  console.log(`  OK ${label}: ${rowCount} row(s)`)
}

;(async () => {
  const c = new Client({ ...cfg, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, statement_timeout: 60000 })
  await c.connect()
  try {
    const sanity = await c.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")
    if (!sanity.rows[0].ok) throw new Error('safety: public.users not visible')
    console.log(`CONNECTED to ${cfg.host} db=${cfg.database}`)

    // ── read ──
    const users = (await c.query("SELECT user_id AS id, name FROM users WHERE role='player'")).rows
    const slots = (await c.query(`SELECT id, date::text AS date, session_type, player_text, balance_status, booking_id
      FROM slots WHERE status='player_confirmed' AND player_text <> ''`)).rows
    const bookings = (await c.query('SELECT id, session_type FROM bookings')).rows
    const payments = (await c.query(`SELECT id, player_id, player_name, status, private_sessions, group_sessions
      FROM payments WHERE status='payment_approved'`)).rows

    const byName = new Map(users.map(x => [(x.name || '').toLowerCase(), x]))
    const bt = new Map(bookings.map(b => [b.id, b.session_type]))
    const acc = new Map(users.map(x => [x.id, { usedP: 0, usedG: 0, paidP: 0, paidG: 0, nullSlots: [] }]))
    const low = (s) => (s || '').trim().toLowerCase()

    for (const s of slots) {
      const type = s.session_type || (s.booking_id ? bt.get(s.booking_id) : null) || 'private'
      const isNull = s.balance_status === null || s.balance_status === 'shortfall'
      for (const n of (s.player_text || '').split(/[/+]/).map(t => t.trim()).filter(Boolean)) {
        const x = byName.get(n.toLowerCase())
        if (!x) continue
        const a = acc.get(x.id)
        if (type === 'group') a.usedG++; else a.usedP++
        if (isNull) a.nullSlots.push(s)
      }
    }
    for (const p of payments) {
      const x = (p.player_id && acc.has(p.player_id)) ? users.find(u2 => u2.id === p.player_id) : byName.get(low(p.player_name))
      if (!x) continue
      const a = acc.get(x.id)
      a.paidP += p.private_sessions || 0
      a.paidG += p.group_sessions || 0
    }

    // ── compute owed (per-type deficit with 1P=2G cross-coverage, floor 0) ──
    const plan = []
    for (const x of users) {
      const a = acc.get(x.id)
      let defP = a.usedP - a.paidP   // >0 = private deficit
      let defG = a.usedG - a.paidG
      const surP = defP < 0 ? -defP : 0
      const surG = defG < 0 ? -defG : 0
      if (defP < 0 && defG > 0) { const cov = Math.min(defG, surP * 2); defG -= cov }
      if (defG < 0 && defP > 0) { const cov = Math.min(defP * 2, surG); defP -= Math.ceil(cov / 2) }
      const owedP = Math.max(0, defP), owedG = Math.max(0, defG)
      const amount = calculatePrice('private', owedP) + calculatePrice('group', owedG)
      if (amount > 0) plan.push({ id: x.id, name: x.name, usedP: a.usedP, usedG: a.usedG, paidP: a.paidP, paidG: a.paidG, owedP, owedG, amount, slots: a.nullSlots })
    }

    console.log('\n═══ INVOICE PLAN (paid vs used → owed at package pricing) ═══')
    console.log('| Player | id | paid P/G | used P/G | owed P/G | amount EGP | slots→deducted |')
    console.log('|--------|----|----------|----------|----------|------------|----------------|')
    for (const p of plan) console.log(`| ${p.name} | ${p.id} | ${p.paidP}/${p.paidG} | ${p.usedP}/${p.usedG} | ${p.owedP}/${p.owedG} | ${p.amount.toLocaleString('en-US')} | ${p.slots.map(s => s.id).join(',') || '—'} |`)

    const farida = plan.find(p => p.id === 12)
    if (!farida || farida.amount !== 15500 || farida.owedP !== 16 || farida.owedG !== 3) {
      throw new Error(`GUARD FAILED: Farida expected owed 16P+3G = 15,500 — got ${farida ? `${farida.owedP}P/${farida.owedG}G = ${farida.amount}` : 'NOT IN PLAN'}`)
    }
    console.log('\n  GUARD OK: Farida = 16P + 3G = 14,000 + 1,500 = 15,500 ✓')

    const total = plan.reduce((s, p) => s + p.amount, 0)
    console.log(`  ${plan.length} invoices, total ${total.toLocaleString('en-US')} EGP`)

    // ── apply ──
    const maxRef = (await c.query("SELECT MAX((regexp_replace(ref,'[^0-9]','','g'))::int) AS m FROM payments WHERE ref LIKE 'PAY-%'")).rows[0].m || 0
    let nextRef = maxRef + 1
    const today = new Date().toISOString().slice(0, 10)

    await c.query('BEGIN')
    let auditN = 0
    for (const p of plan) {
      const ref = `PAY-${String(nextRef++).padStart(4, '0')}`
      const ins = await c.query(`INSERT INTO payments
        (ref, date, player_name, player_id, method, amount, private_sessions, group_sessions, notes, status, booking_id, created_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'Cash',$5,$6,$7,$8,'payment_approved',NULL,NULL,now(),now()) RETURNING id`,
        [ref, today, p.name, p.id, p.amount, p.owedP, p.owedG,
         'Retroactive: unpaid sessions invoiced at package pricing (auto-reconciliation)'])
      expect(`payment ${ref} for ${p.name}`, ins.rowCount, 1)
      const pid = ins.rows[0].id
      if (p.slots.length) {
        const ids = p.slots.map(s => s.id)
        const r = await c.query(`UPDATE slots SET balance_status='deducted', updated_at=now()
          WHERE id = ANY($1) AND status='player_confirmed' AND balance_status IS DISTINCT FROM 'deducted'`, [ids])
        expect(`${p.name} slots → deducted`, r.rowCount, p.slots.length)
      }
      await c.query(`INSERT INTO audit_logs (action, target_type, target_id, timestamp, rec_before, rec_after) VALUES
        ('create','payment',$1,now(),NULL,$2::jsonb)`, [String(pid),
        JSON.stringify({ ref, player: p.name, amount: p.amount, owedP: p.owedP, owedG: p.owedG, note: 'unpaid sessions package-priced invoice' })])
      if (p.slots.length) {
        await c.query(`INSERT INTO audit_logs (action, target_type, target_id, timestamp, rec_before, rec_after) VALUES
          ('balance.correction','user',$1,now(),$2::jsonb,$3::jsonb)`, [String(p.id),
          JSON.stringify({ never_deducted_slots: p.slots.map(s => s.id) }),
          JSON.stringify({ balance_status: 'deducted', note: `settled via ${ref}` })])
      }
      auditN += 1 + (p.slots.length ? 1 : 0)
    }

    await c.query('COMMIT')
    console.log(`COMMITTED — ${plan.length} payments, ${auditN} audit rows`)
  } catch (e) {
    try { await c.query('ROLLBACK'); console.log('ROLLED BACK — no changes applied') } catch {}
    console.error('FAILED:', e.message)
    await c.end()
    process.exit(1)
  }

  const v = await c.query(`SELECT p.id, p.ref, p.player_name, p.amount, p.private_sessions, p.group_sessions, p.status
    FROM payments p WHERE p.notes LIKE 'Retroactive%' ORDER BY p.id`)
  console.log('verify payments:', JSON.stringify(v.rows))
  const v2 = await c.query("SELECT COUNT(*) AS n FROM slots WHERE balance_status IS NULL AND status='player_confirmed'")
  console.log('verify remaining NULL confirmed slots:', v2.rows[0].n)
  await c.end()
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
