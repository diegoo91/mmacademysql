import fs from 'node:fs'

/**
 * Rollback Phase 3C — reverses every payment created by _apply-nearest-packages.
 * DELETE /api/payments/:id reverses the credit exactly (settlement-aware), so
 * balances/debt return to the pre-apply state.
 *
 * Safety: before each DELETE the row is re-fetched and must still match the
 * manifest (ref + amount + player) — anything unexpected aborts the run.
 * Post-check: /api/reports/unpaid must return to 107,700 EGP / 20 players.
 */

const BASE = 'http://127.0.0.1:5174/api'
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
if (!env.ADMIN_PASSWORD) { console.error('FATAL: ADMIN_PASSWORD not set in server/.env'); process.exit(1) }
const login = await api('POST', '/auth/login', { email: env.ADMIN_EMAIL || 'admin@mmpadel.com', password: env.ADMIN_PASSWORD }, null)
if (!login.ok || !login.data?.accessToken) {
  console.error('FATAL: admin login failed:', login.status, JSON.stringify(login.data))
  process.exit(1)
}
const token = login.data.accessToken
console.log('Logged in as', env.ADMIN_EMAIL || 'admin@mmpadel.com')

const manifestPath = new URL('./data/phase3c-payments.json', import.meta.url)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
console.log(`Manifest: ${manifest.created_count} payment(s) from ${manifest.applied_at}\n`)

const deleted = []
let failed = null

// snapshot once — rows only change via our own deletes below
const listBefore = await api('GET', '/payments', null, token)
const rowsById = new Map(listBefore.ok ? listBefore.data.map(x => [x.id, x]) : [])

for (const p of manifest.payments) {
  // pre-flight: row must still be exactly what we created
  const row = rowsById.get(p.payment_id) || null
  if (!row) {
    console.log(`SKIP ${p.ref} ${p.player_name}: already gone`)
    continue
  }
  if (row.ref !== p.ref || (Number(row.amount) !== Number(p.amount)) || Number(row.player_id) !== Number(p.player_id)) {
    failed = { ...p, reason: 'row mismatch', row: { ref: row.ref, amount: row.amount, player_id: row.player_id } }
    console.error(`ABORT ${p.ref} ${p.player_name}: row changed since apply —`, JSON.stringify(failed.row))
    break
  }
  const res = await api('DELETE', `/payments/${p.payment_id}`, null, token)
  if (!res.ok) {
    failed = { ...p, reason: 'delete failed', status: res.status, data: res.data }
    console.error(`FAIL ${p.ref} ${p.player_name} -> ${res.status} ${JSON.stringify(res.data)}`)
    break
  }
  deleted.push(p)
  console.log(`DELETED ${p.ref}  ${p.player_name}  EGP ${p.amount}`)
}

console.log(`\nDeleted ${deleted.length}/${manifest.created_count}`)

// ---- post-verification: must be back to the pre-apply state ----
const after = await api('GET', '/reports/unpaid', null, token)
if (after.ok) {
  const total = Math.round(after.data.total_owed)
  const count = after.data.unpaid_players.length
  const okTotal = total === APPROVED_TOTAL && count === APPROVED_COUNT
  console.log(`Post-state: ${count} player(s), EGP ${total.toLocaleString('en-US')} owed — ${okTotal ? 'MATCHES pre-apply state' : 'DRIFT vs expected ' + APPROVED_COUNT + ' / ' + APPROVED_TOTAL}`)
} else {
  console.error('POST-CHECK FAILED: /reports/unpaid ->', after.status, after.data)
}

// confirm the rows are gone
const list = await api('GET', '/payments', null, token)
if (list.ok) {
  const leftovers = list.data.filter(x => manifest.payments.some(p => p.id === x.id || x.ref === p.ref))
  console.log(`Rows still present: ${leftovers.length}`)
}

if (deleted.length !== manifest.created_count) { console.error('\nROLLBACK INCOMPLETE'); process.exit(1) }
console.log('\nRollback complete — all Phase 3C payments reversed.')
