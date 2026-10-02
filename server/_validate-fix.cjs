/**
 * Read-only validation table: users whose balance actually needs modification.
 *
 * Formula (group-equivalent units, 1P = 2G):
 *   paid_eq   = 2*SUM(private_sessions) + SUM(group_sessions)   [approved payments, RAW]
 *   used_eq   = 2*used_private + used_group                     [confirmed slots]
 *   expected  = paid_eq - used_eq        (floored at 0 — no new debt proposed)
 *   cur_eq    = effective group balance (legacy + cycle, expiry-aware, clamped >= 0)
 *   over      = cur_eq - max(0, expected)     → candidate only if over >= 1
 *
 * After-bucket proposal (exact eq, no new debt):
 *   over = 2a + b  →  reduce private by a (cycle first, then legacy),
 *                     reduce group by b (cycle first, then legacy)
 *
 * Run: node _validate-fix.cjs
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
async function main() {
  const u = new URL(parseEnv(path.join(ROOT, 'server', '.env')).PROD_DATABASE_URL)
  const c = new Client({
    host: u.hostname, port: Number(u.port) || 6543,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: (u.pathname || '/').replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, statement_timeout: 60000,
  })
  await c.connect()
  const q = async (sql, params) => {
    if (!/^\s*(select|with)/i.test(sql)) throw new Error('NON-SELECT blocked')
    return (await c.query(sql, params)).rows
  }
  try {
    const users = await q(`SELECT user_id AS id, name, private_balance, group_balance,
      cycle_private, cycle_group, cycle_key, cycle_expires_at FROM users WHERE role='player' ORDER BY name`)
    const slots = await q(`SELECT id, session_type, player_text, balance_status, booking_id FROM slots
      WHERE status='player_confirmed' AND player_text <> ''`)
    const bookings = await q(`SELECT id, session_type FROM bookings`)
    const payments = await q(`SELECT id, player_id, status, private_sessions, group_sessions,
      settled_private, settled_group FROM payments WHERE status='payment_approved'`)

    const now = new Date()
    const expired = (x) => !!(x.cycle_expires_at && new Date(x.cycle_expires_at) < now)
    const curP = (x) => Math.max(0, x.private_balance || 0) + (expired(x) ? 0 : Math.max(0, x.cycle_private || 0))
    const curG = (x) => Math.max(0, x.group_balance || 0) + Math.max(0, x.private_balance || 0) * 2 +
      (expired(x) ? 0 : Math.max(0, x.cycle_group || 0) + Math.max(0, x.cycle_private || 0) * 2)

    const byName = new Map(users.map(x => [(x.name || '').toLowerCase(), x]))
    const bt = new Map(bookings.map(b => [b.id, b.session_type]))
    const stat = new Map(users.map(x => [x.id, { paidP: 0, paidG: 0, usedP: 0, usedG: 0, cand: 0, candSlots: [] }]))
    for (const s of slots) {
      const type0 = s.session_type || (s.booking_id ? bt.get(s.booking_id) : null) || 'private'
      const cand = s.balance_status === null || s.balance_status === 'shortfall'
      for (const n of (s.player_text || '').split(/[/+]/).map(t => t.trim()).filter(Boolean)) {
        const x = byName.get(n.toLowerCase())
        if (!x) continue
        const st = stat.get(x.id)
        if (type0 === 'group') st.usedG++; else st.usedP++
        if (cand) { st.cand++; st.candSlots.push(s.id) }
      }
    }
    for (const p of payments) {
      if (!p.player_id || !stat.has(p.player_id)) continue
      const st = stat.get(p.player_id)
      st.paidP += p.private_sessions || 0
      st.paidG += p.group_sessions || 0
    }

    const rows = []
    for (const x of users) {
      const st = stat.get(x.id)
      const paidEq = 2 * st.paidP + st.paidG
      const usedEq = 2 * st.usedP + st.usedG
      const expected = paidEq - usedEq
      const cG = curG(x), cP = curP(x)
      const over = cG - Math.max(0, expected)
      const under = Math.max(0, expected) - cG
      // bucket proposal: exact-eq reduction, cycle first, no new debt
      let need = over
      const stored = {
        cycP: expired(x) ? 0 : Math.max(0, x.cycle_private || 0),
        cycG: expired(x) ? 0 : Math.max(0, x.cycle_group || 0),
        legP: Math.max(0, x.private_balance || 0),
        legG: Math.max(0, x.group_balance || 0),
      }
      const plan = []
      if (need >= 1) {
        const a = Math.floor(need / 2), b = need % 2
        if (a > 0) {
          const t = Math.min(a, stored.cycP); if (t) { stored.cycP -= t; plan.push(`cycle_private -${t}`) }
          const r = a - t; if (r > 0 && stored.legP > 0) { const t2 = Math.min(r, stored.legP); stored.legP -= t2; plan.push(`private_balance -${t2}`) }
        }
        if (b === 1) {
          const t = Math.min(1, stored.cycG); if (t) { stored.cycG -= t; plan.push(`cycle_group -${t}`) }
          else if (stored.legG > 0) { stored.legG -= 1; plan.push(`group_balance -1`) }
          else plan.push('⚠ no group bucket to shave 1G — manual decision')
        }
        const leftNeed = over - (a * 2 + b - (plan.some(p => p.startsWith('⚠')) ? 0 : 0))
        void leftNeed
      }
      const afterP = stored.cycP + stored.legP
      const afterG = stored.cycG + stored.legG + stored.legP * 0 // eff recompute below
      void afterG
      const afterEq = Math.max(0, stored.legG) + Math.max(0, stored.legP) * 2 + stored.cycG + stored.cycP * 2
      rows.push({
        name: x.name, id: x.id, st, paidEq, usedEq, expected, cP, cG, over, under,
        storedOrig: { legP: x.private_balance || 0, legG: x.group_balance || 0, cycP: x.cycle_private || 0, cycG: x.cycle_group || 0 },
        plan, afterP, afterEq, expired: expired(x),
      })
    }

    console.log('═══ TABLE A: NEEDS MODIFICATION (over-credited → before/after) ═══')
    console.log('| Player | id | Before effP/effG | After effP/effG | Change (stored buckets) | paid P/G | used P/G | never-deducted slots |')
    console.log('|--------|----|------------------|-----------------|-------------------------|----------|----------|----------------------|')
    const mods = rows.filter(r => r.over >= 1)
    for (const r of mods) {
      const before = `${r.cP}/${r.cG}`
      const after = `${r.afterP}/${r.afterEq}`
      const change = r.plan.join(', ') || '—'
      console.log(`| ${r.name} | ${r.id} | ${before} | ${after} | ${change} | ${r.st.paidP}/${r.st.paidG} | ${r.st.usedP}/${r.st.usedG} | ${r.st.cand} (${r.st.candSlots.join(',') || '—'}) |`)
    }
    if (!mods.length) console.log('| — | — | — | — | none | — | — | — |')

    console.log('\n═══ TABLE B: UNDER-credited (expected > current — usually EXPIRED cycles; no action) ═══')
    const unders = rows.filter(r => r.under >= 1)
    for (const r of unders) {
      console.log(`  ${r.name} (id ${r.id}): before ${r.cP}/${r.cG}, expected_eq=${r.expected}, under_eq=${r.under}${r.expired ? ' [cycle expired]' : ''} paid=${r.st.paidP}P/${r.st.paidG}G used=${r.st.usedP}P/${r.st.usedG}G`)
    }
    if (!unders.length) console.log('  none ✓')

    console.log('\n═══ TABLE C: UNPAID sessions (expected < 0, currently at 0) — strict mode would CREATE debt ═══')
    const debts = rows.filter(r => r.expected < 0 && r.cG === 0)
    for (const r of debts) console.log(`  ${r.name} (id ${r.id}): paid_eq=${r.paidEq} used_eq=${r.usedEq} → would become debt_eq=${-r.expected} (after ${r.cP}/${r.cG} → 0/debt)`)
    if (!debts.length) console.log('  none ✓')

    console.log('\n═══ REGRESSION: Aley (id 6) & Ammar (id 7) — must show NO change (already fixed) ═══')
    for (const id of [6, 7]) {
      const r = rows.find(x => x.id === id)
      if (!r) { console.log(`  id ${id}: NOT FOUND ✗`); continue }
      console.log(`  ${r.name}: before ${r.cP}/${r.cG} | expected_eq=${r.expected} | over=${r.over} → ${r.over >= 1 ? 'WOULD MODIFY ✗' : 'no change ✓'} | paid=${r.st.paidP}P/${r.st.paidG}G used=${r.st.usedP}P/${r.st.usedG}G`)
    }

    console.log(`\nSUMMARY: ${rows.length} players scanned | ${mods.length} need modification | ${unders.length} under (expired, no action) | ${debts.length} unpaid-at-zero (strict-mode option)`)
  } finally { await c.end() }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
