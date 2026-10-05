import fs from 'node:fs'

/**
 * Phase 3C — apply approved nearest-tier package payments (user-approved).
 * For each player in data/unpaid-recommendations.json creates a Cash payment
 * (amount = nearest package price) via POST /api/payments, which immediately
 * settles existing debt FIFO (approved status, money-driven allocation).
 *
 * Safety:
 *   - pre-flight: aborts if /api/reports/unpaid drifts from the approved list
 *     (total 107,700 EGP / 20 players)
 *   - stops on first failed POST, keeping the rollback manifest up to date
 *   - writes data/phase3c-payments.json (payment ids) for rollback:
 *       DELETE /api/payments/:id  (reverses the credit exactly)
 */

const BASE = 'http://127.0.0.1:5174/api'
const DATE = '2026-10-02'
const APPROVED_TOTAL = 107700
const APPROVED_COUNT = 20

const loadEnv = (file) => {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch (e) {
    return { status: 0, ok: false, data: { error: e.message } }
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, ok: res.ok, data }
}

const env = loadEnv(new URL('./.env', import.meta.url))
const email = env.ADMIN_EMAIL || 'admin@mmpadel.com'
const password = env.ADMIN_PASSWORD
if (!password) { console.error('FATAL: ADMIN_PASSWORD not set in server/.env'); process.exit(1) }

const login = await api('POST', '/auth/login', { email, password }, null)
if (!login.ok || !login.data?.accessToken) {
  console.error('FATAL: admin login failed:', login.status, JSON.stringify(login.data))
  process.exit(1)
}
const token = login.data.accessToken
console.log(`Logged in as ${email}`)

const recs = JSON.parse(fs.readFileSync(new URL('./data/unpaid-recommendations.json', import.meta.url), 'utf8'))

// ---- pre-flight: unpaid report must match the approved recommendation list ----
const before = await api('GET', '/reports/unpaid', null, token)
if (!before.ok) { console.error('FATAL: /reports/unpaid failed', before.status, before.data); process.exit(1) }
const beforeIds = new Set(before.data.unpaid_players.map(p => p.id))
const recIds = new Set(recs.map(r => r.id))
const missing = [...recIds].filter(id => !beforeIds.has(id))
const drifted = [...beforeIds].filter(id => !recIds.has(id))
if (Math.round(before.data.total_owed) !== APPROVED_TOTAL || before.data.unpaid_players.length !== APPROVED_COUNT || missing.length || drifted.length) {
  console.error('FATAL: unpaid report drifted from approved list — aborting.', {
    total_owed: before.data.total_owed, count: before.data.unpaid_players.length, missing, extra: drifted,
  })
  process.exit(1)
}
console.log(`Pre-flight OK: ${APPROVED_COUNT} players, EGP ${APPROVED_TOTAL.toLocaleString('en-US')} owed\n`)

// ---- apply ----
const manifestPath = new URL('./data/phase3c-payments.json', import.meta.url)
const created = []
let failed = null

for (const r of recs) {
  const res = await api('POST', '/payments', {
    date: DATE,
    player_name: r.name,
    player_id: r.id,
    method: 'Cash',
    amount: r.nearest_price,
    notes: `Phase 3C: nearest tier ${r.nearest_tier}-private package (auto-settlement)`,
  }, token)
  if (!res.ok) {
    failed = { id: r.id, name: r.name, status: res.status, data: res.data }
    console.error(`FAIL ${r.name} (id ${r.id}) -> ${res.status} ${JSON.stringify(res.data)}`)
    break
  }
  created.push({
    payment_id: res.data.id,
    ref: res.data.ref,
    player_id: r.id,
    player_name: r.name,
    amount: r.nearest_price,
    nearest_tier: r.nearest_tier,
    private_sessions: res.data.private_sessions,
    group_sessions: res.data.group_sessions,
    allocation: res.data.allocation || null,
    settlement: res.data.settlement || null,
  })
  console.log(`OK  ${res.data.ref}  ${r.name}  EGP ${r.nearest_price.toLocaleString('en-US')}  (${r.nearest_tier}-pvt)  covered ${res.data.private_sessions ?? '?'}P/${res.data.group_sessions ?? '?'}G  settled ${JSON.stringify(res.data.settlement || {})}`)
}

fs.writeFileSync(manifestPath, JSON.stringify({
  applied_at: new Date().toISOString(),
  date: DATE,
  approved_total: APPROVED_TOTAL,
  created_count: created.length,
  failed,
  rollback: created.map(c => `DELETE /api/payments/${c.payment_id}`),
  payments: created,
}, null, 2))
console.log(`\nManifest written: server/data/phase3c-payments.json (${created.length} payment(s))`)

// ---- post-verification ----
const after = await api('GET', '/reports/unpaid', null, token)
if (after.ok) {
  const rows = after.data.unpaid_players
    .slice()
    .sort((a, b) => b.amount_owed - a.amount_owed)
    .map(p => ({ name: p.name, owed: p.amount_owed, p: p.unpaid_private, g: p.unpaid_group }))
  console.log(`\nPost-state: ${rows.length} player(s) still unpaid, total EGP ${after.data.total_owed.toLocaleString('en-US')}`)
  const expected = recs.filter(r => r.sim.remainder_amount > 0)
  const expectedTotal = expected.reduce((s, r) => s + r.sim.remainder_amount, 0)
  console.log(`Sim expected remainder: ${expected.length} player(s), EGP ${expectedTotal.toLocaleString('en-US')}`)
  for (const row of rows) console.log(`  ${row.name}: ${row.p}P/${row.g}G — EGP ${row.owed.toLocaleString('en-US')}`)
} else {
  console.error('POST-CHECK FAILED: /reports/unpaid ->', after.status, after.data)
}

if (failed) { console.error('\nSTOPPED ON FAILURE — fix and re-run remaining players manually.'); process.exit(1) }
console.log('\nPhase 3C complete.')
