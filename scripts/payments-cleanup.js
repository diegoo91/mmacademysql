#!/usr/bin/env node
/**
 * Payments cleanup — pairing report (READ-ONLY) and apply (explicit flags only).
 *
 * Keep-list: scripts/payments-keep.json (20 rows the operator wants to keep).
 * Every other payments row is a delete candidate.
 *
 * Matching rules (per operator agreement):
 *   anchor:  amount exact + method exact (required)
 *   name:    exact tier first, then bidirectional-containment tier
 *   date:    exact > ±1 day > wider
 *   exactly 1 candidate at the best tier  -> PAIRED (confident if date exact, likely if ±1)
 *   0 or >1 candidates                    -> UNCLEAR (operator must resolve manually)
 *
 * Sources:
 *   --source=local   server/data/academy.db.json (JSON backend)
 *   --source=prod    Railway API (VITE prod endpoint), admin login
 *
 * Modes:
 *   --report                      read-only pairing report (default)
 *   --apply --confirm=<file>      apply deletions using an operator-confirmed ID list
 *   --rebuild                     recompute balances after deletes (approved kept payments - slot consumption)
 *   --purge-audit                 delete audit_logs rows referencing deleted payment ids + run balance rows
 *
 * Usage:
 *   node scripts/payments-cleanup.js --source=local --report
 *   node scripts/payments-cleanup.js --source=prod  --report
 *   node scripts/payments-cleanup.js --source=prod  --apply --confirm=scripts/payments-confirm.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const KEEP_PATH = join(__dirname, 'payments-keep.json')
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

const args = process.argv.slice(2)
const getArg = (name, def = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const hasFlag = name => args.includes(`--${name}`)

const SOURCE = getArg('source', 'local')
const API_BASE = 'https://mm-academy-api-production.up.railway.app'
const LOCAL_JSON = join(ROOT, 'server', 'data', 'academy.db.json')
const BACKUP_DIR = join(__dirname, 'payments-backups')

// ── helpers ────────────────────────────────────────────────────────
const normName = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const normMethod = s => String(s || '').trim().toLowerCase()
const normAmount = a => Math.round((parseFloat(a) || 0) * 100) / 100

function normDate(d) {
  if (!d) return null
  const s = String(d).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const t = Date.parse(d)
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}
function dayDiff(a, b) {
  if (!a || !b) return 9999
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86400000)
}
function nameTier(keepName, payName) {
  const k = normName(keepName), p = normName(payName)
  if (!k || !p) return 0
  if (k === p) return 3 // exact
  if (k.includes(p) || p.includes(k)) return 2 // bidirectional containment
  // token overlap: all tokens of the shorter name present in the longer
  const kt = k.split(' '), pt = p.split(' ')
  const [short, long] = kt.length <= pt.length ? [kt, pt] : [pt, kt]
  if (short.every(t => long.includes(t))) return 1
  return 0
}

// ── sources ────────────────────────────────────────────────────────
async function loadProd() {
  // read creds from server/.env
  const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8')
  const email = env.match(/^ADMIN_EMAIL=(.*)$/m)?.[1]?.trim() || 'admin@mmpadel.com'
  const password = env.match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim()
  if (!password) throw new Error('ADMIN_PASSWORD not found in server/.env')
  const login = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const ld = await login.json()
  if (!login.ok) throw new Error(`login failed ${login.status}: ${JSON.stringify(ld)}`)
  const res = await fetch(`${API_BASE}/api/payments`, { headers: { Authorization: `Bearer ${ld.accessToken}` } })
  const payments = await res.json()
  if (!res.ok || !Array.isArray(payments)) throw new Error(`payments fetch failed: ${JSON.stringify(payments).slice(0, 300)}`)
  return { payments, token: ld.accessToken }
}
function loadLocal() {
  const data = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'))
  return { payments: data.payments || [] }
}

// ── pairing ────────────────────────────────────────────────────────
function pair(keepRows, payments) {
  const used = new Set()
  const results = keepRows.map((k, idx) => {
    const kd = normDate(k.date)
    // stage 1: anchor = amount + method
    let cands = payments
      .map(p => ({ p }))
      .filter(({ p }) => normAmount(p.amount) === normAmount(k.amount) && normMethod(p.method) === normMethod(k.method))
    if (cands.length === 0) return { keep: k, status: 'NO_CANDIDATE', why: 'no payment with same amount+method' }
    // stage 2: name tiers
    const withTier = cands.map(c => ({ ...c, nt: nameTier(k.player, c.p.player_name) }))
    const bestNt = Math.max(...withTier.map(c => c.nt))
    if (bestNt === 0) return { keep: k, status: 'NO_CANDIDATE', why: 'amount+method match but no name similarity', candidates: withTier.map(c => c.p.player_name) }
    let named = withTier.filter(c => c.nt === bestNt)
    // stage 3: date
    const withDate = named.map(c => ({ ...c, dd: dayDiff(kd, normDate(c.p.date)) }))
    const bestDd = Math.min(...withDate.map(c => c.dd))
    let final = withDate.filter(c => c.dd === bestDd)
    // drop already-used (another keep-row claimed it)
    final = final.filter(c => !used.has(c.p.id))
    if (final.length === 1) {
      const c = final[0]
      used.add(c.p.id)
      const status = c.dd === 0 && c.nt === 3 ? 'PAIRED' : c.dd <= 1 ? 'LIKELY' : 'UNCLEAR'
      return { keep: k, status, payment: c.p, why: `name tier ${c.nt}, date diff ${c.dd}d` }
    }
    if (final.length === 0) {
      const alt = withDate.filter(c => !used.has(c.p.id))
      if (alt.length === 1) {
        const c = alt[0]; used.add(c.p.id)
        return { keep: k, status: 'LIKELY', payment: c.p, why: `fallback: name tier ${c.nt}, date diff ${c.dd}d` }
      }
      return { keep: k, status: 'UNCLEAR', why: 'all candidates claimed by other keep-rows', candidates: withDate.map(c => `${c.p.player_name} ${c.p.date} id=${c.p.id}`) }
    }
    return { keep: k, status: 'UNCLEAR', why: `${final.length} equally-good candidates`, candidates: final.map(c => `${c.p.player_name} ${c.p.date} id=${c.p.id} ref=${c.p.ref}`) }
  })
  const deleteCandidates = payments.filter(p => !used.has(p.id))
  return { results, deleteCandidates }
}

// ── report ─────────────────────────────────────────────────────────
async function report() {
  const keepRows = JSON.parse(readFileSync(KEEP_PATH, 'utf8'))
  const { payments } = SOURCE === 'prod' ? await loadProd() : loadLocal()
  const { results, deleteCandidates } = pair(keepRows, payments)

  const paired = results.filter(r => r.status === 'PAIRED')
  const likely = results.filter(r => r.status === 'LIKELY')
  const unclear = results.filter(r => r.status === 'UNCLEAR' || r.status === 'NO_CANDIDATE')

  console.log(`\n=== Payments pairing report (${SOURCE}) ===`)
  console.log(`DB payments: ${payments.length} | keep-rows: ${keepRows.length}`)
  console.log(`PAIRED: ${paired.length}  LIKELY (date±1/name-partial): ${likely.length}  UNCLEAR: ${unclear.length}`)

  if (paired.length) {
    console.log('\n-- PAIRED (confident) --')
    for (const r of paired) console.log(`  keep [${r.keep.date} ${r.keep.player} ${r.keep.method} ${r.keep.amount}] -> db id=${r.payment.id} ${r.payment.ref} [${r.payment.date} ${r.payment.player_name} ${r.payment.method} ${r.payment.amount}]`)
  }
  if (likely.length) {
    console.log('\n-- LIKELY (verify before apply) --')
    for (const r of likely) console.log(`  keep [${r.keep.date} ${r.keep.player} ${r.keep.method} ${r.keep.amount}] -> db id=${r.payment.id} ${r.payment.ref} [${r.payment.date} ${r.payment.player_name}] (${r.why})`)
  }
  if (unclear.length) {
    console.log('\n-- UNCLEAR / NO CANDIDATE (operator must resolve) --')
    for (const r of unclear) {
      console.log(`  keep [${r.keep.date} ${r.keep.player} ${r.keep.method} ${r.keep.amount}] => ${r.status}: ${r.why}`)
      if (r.candidates) for (const c of r.candidates) console.log(`      candidate: ${c}`)
    }
  }
  console.log(`\n-- DELETE CANDIDATES (${deleteCandidates.length}) --`)
  for (const p of deleteCandidates) console.log(`  id=${p.id} ${p.ref} [${p.date} ${p.player_name} ${p.method} ${p.amount}] status=${p.status}`)
  const keepTotal = results.filter(r => r.payment).reduce((s, r) => s + normAmount(r.payment.amount), 0)
  const delTotal = deleteCandidates.reduce((s, p) => s + normAmount(p.amount), 0)
  console.log(`\nTotals: kept ${keepTotal} EGP (${results.filter(r => r.payment).length} rows) | delete ${delTotal} EGP (${deleteCandidates.length} rows) | all ${payments.length} rows = ${keepTotal + delTotal} EGP`)
  console.log(`keep-list sum: ${keepRows.reduce((s, r) => s + r.amount, 0)} EGP`)

  // write backup + machine-readable report
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const backupPath = join(BACKUP_DIR, `payments-${SOURCE}-${TS}.json`)
  writeFileSync(backupPath, JSON.stringify(payments, null, 2))
  const pairPath = join(BACKUP_DIR, `pairing-${SOURCE}-${TS}.json`)
  writeFileSync(pairPath, JSON.stringify({ results, deleteCandidateIds: deleteCandidates.map(p => p.id) }, null, 2))
  console.log(`\nbackup:  ${backupPath}`)
  console.log(`pairing: ${pairPath}`)
  const ok = unclear.length === 0
  console.log(ok ? '\nALL KEEP-ROWS PAIRED — ready for --apply with confirmed id list.' : '\nBLOCKED: resolve every UNCLEAR row first (operator confirmation required).')
  process.exit(ok ? 0 : 2)
}

// ── apply ──────────────────────────────────────────────────────────
async function apply() {
  const confirmPath = getArg('confirm')
  if (!confirmPath) { console.error('--apply requires --confirm=<path> with { "deleteIds": [...] }'); process.exit(1) }
  const { deleteIds } = JSON.parse(readFileSync(confirmPath, 'utf8'))
  if (!Array.isArray(deleteIds) || deleteIds.length === 0) { console.error('confirm file has no deleteIds'); process.exit(1) }

  if (SOURCE === 'prod') {
    const { token } = await loadProd()
    const results = []
    for (const id of deleteIds) {
      const res = await fetch(`${API_BASE}/api/payments/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      const body = await res.text()
      results.push({ id, status: res.status, body: body.slice(0, 160) })
      console.log(`DELETE ${id}: ${res.status}`)
      await new Promise(r => setTimeout(r, 250)) // stay under rate limits
    }
    const failed = results.filter(r => r.status >= 400)
    console.log(`\nApplied: ${results.length - failed.length}/${results.length} deleted`)
    if (failed.length) { console.log('FAILURES:'); failed.forEach(f => console.log(`  id=${f.id} ${f.status} ${f.body}`)) }
    writeFileSync(join(BACKUP_DIR, `apply-prod-${TS}.json`), JSON.stringify(results, null, 2))
    process.exit(failed.length ? 1 : 0)
  } else {
    // local JSON backend
    const data = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'))
    const before = data.payments.length
    data.payments = data.payments.filter(p => !deleteIds.includes(p.id))
    writeFileSync(LOCAL_JSON, JSON.stringify(data, null, 2))
    console.log(`Local: removed ${before - data.payments.length} payments (${before} -> ${data.payments.length})`)
  }
}

// ── entry ──────────────────────────────────────────────────────────
if (hasFlag('apply')) await apply()
else await report()
