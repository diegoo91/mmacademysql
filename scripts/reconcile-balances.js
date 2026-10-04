#!/usr/bin/env node
/**
 * Reconcile player balances against the paid-FIFO truth.
 *
 * Root cause it repairs: paymentAllocation split covered/credit per-bucket
 * while the sessions list (sessionPaid) converts across buckets (1P = 2G) —
 * so balances drifted from what slots actually paid for ("8P credited 7P,
 * group debt never settled" class of bugs).
 *
 * Method (operator-approved — deterministic generalisation of
 * reverse-and-reapply): per player with ≥1 approved MANUAL payment:
 *     1) ensureCycleFresh — lazy-expire a past cycle exactly like the runtime
 *     2) RE-SEED to the empty-pool truth: legacy = -uncovered(no credit),
 *        cycle zeroed. Same base for ANY starting balance, so one pass
 *        reaches exact state + columns (stale reverse floors / phantom
 *        legacy cannot leak through)
 *     3) RE-APPLY oldest→newest with the CORRECTED split — cumulative
 *        simulateFifo deltas (pooled, chronological, same engine as the
 *        sessions list): settleDebtWith(covered) then creditCycle(credit),
 *        settlement columns stored back on each payment row (the routes'
 *        applyAllocation combination, cell for cell)
 *     4) TRIM — exactness net (should be a no-op after the re-seed forward
 *        pass; final state is verified per player)
 *
 * Targets come from the SAME engine as unpaid reports/receipts:
 *   credit = simulateFifo remaining (pool leftovers)
 *   debt   = -uncovered slots by type
 *
 * Excluded: booking-linked payments (their slots settle directly),
 *           players with no approved manual payment (legacy balances are an
 *           operator decision, not an arithmetic error — reported only).
 *
 * The slot walk mirrors sessionPaid.js exactly (same name match, sort,
 * session-type fallback, external-paid rules) and aborts if its uncovered
 * counts disagree with computePlayerSessions (mirror safety check).
 *
 * Usage:
 *   node scripts/reconcile-balances.js --source=localpg            # dry run
 *   node scripts/reconcile-balances.js --source=localpg --apply    # repair
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const args = process.argv.slice(2)
const getArg = (n, d = null) => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const hasFlag = n => args.includes(`--${n}`)
const SOURCE = getArg('source', 'localpg')
const APPLY = hasFlag('apply')
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

// ── env BEFORE importing server modules (sql.js reads it at import) ────────
const env = readFileSync(join(ROOT, 'server', '.env'), 'utf8')
const pick = (k, d) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() || d
if (SOURCE === 'localpg') {
  process.env.DB_HOST = pick('DB_HOST', 'localhost')
  process.env.DB_PORT = pick('DB_PORT', '5432')
  process.env.DB_NAME = pick('DB_NAME', 'mmacademy')
  process.env.DB_USER = pick('DB_USER', 'postgres')
  process.env.DB_PASSWORD = pick('DB_PASSWORD', '')
} else {
  process.env.DATABASE_URL = pick('PROD_DATABASE_URL') || pick('DATABASE_URL')
  if (!process.env.DATABASE_URL) { console.error('prod URL missing in server/.env'); process.exit(1) }
}
process.env.DB_ENABLED = 'true'

const db = (await import('../server/src/db.js')).default
const { getKnex } = await import('../server/src/sql.js')
const { computePlayerSessions } = await import('../server/src/utils/sessionPaid.js')
const { simulateFifo } = await import('../server/src/utils/convertBalance.js')
const { settleDebtWith, creditCycle, ensureCycleFresh, currentCycleKey, cycleExpiryFor, planSettlement } = await import('../server/src/utils/cycle.js')

const EMPTY_SETTLEMENT = { settled_private: 0, settled_group: 0, credited_private: 0, credited_group: 0 }
const byChrono = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.id || 0) - (b.id || 0)
const isCycleLive = u => !!(u.cycle_key && u.cycle_expires_at && new Date(u.cycle_expires_at) >= new Date())

/** Mirrors sessionPaid.js: player's slots in (date, time) order + session type + external-paid flag. */
function buildEntries(player, allSlots, allPayments, bookingById) {
  const playerName = (player.name || '').toLowerCase()
  const playerSlots = allSlots
    .filter(s => {
      if (!s.player_text) return false
      return s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase()).includes(playerName)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  return playerSlots.map(s => {
    const booking = s.booking_id ? bookingById.get(s.booking_id) || null : null
    const directPayment = booking
      ? allPayments.find(p => p.booking_id === booking.id && p.status === 'payment_approved') || null
      : null
    return {
      session_type: s.session_type || (booking ? booking.session_type : null) || 'private',
      _external: !!(directPayment || booking?.paid || s.status === 'payment_approved'),
    }
  })
}

/**
 * Corrected per-payment splits: cumulative pooled FIFO deltas in chronological
 * order (telescopes to the final target walk; per-bucket floors reported).
 */
function cumulativeSplits(orderedPayments, entries) {
  let cum = { p: 0, g: 0 }
  let prevCov = { private: 0, group: 0 }
  let prevRem = { private: 0, group: 0 }
  let clamped = false
  const splits = []
  for (const p of orderedPayments) {
    cum.p += p.private_sessions || 0
    cum.g += p.group_sessions || 0
    const w = simulateFifo(cum.p, cum.g, entries, { isExternallyPaid: (s) => s._external })
    const cov = { private: w.covered.private - prevCov.private, group: w.covered.group - prevCov.group }
    const rem = { private: w.remaining.private - prevRem.private, group: w.remaining.group - prevRem.group }
    if (cov.private < 0 || cov.group < 0 || rem.private < 0 || rem.group < 0) clamped = true
    prevCov = w.covered
    prevRem = w.remaining
    splits.push({
      payment: p,
      covered: { private: Math.max(0, cov.private), group: Math.max(0, cov.group) },
      credit: { private: Math.max(0, rem.private), group: Math.max(0, rem.group) },
    })
  }
  return { splits, clamped }
}

/**
 * What apply() WILL store on each manual payment's row — a pure replay of the
 * same deterministic sequence: RE-SEED to the empty-pool truth
 * (legacy = -uncovered(empty pool), cycle = 0), then forward per split via
 * planSettlement, mirroring routes' applyAllocation cell for cell.
 *
 * Re-seeding makes the result independent of the starting balance, so replay
 * converges to a fixed point after one apply (no drift loops), and columns
 * stay exact for routes' edit/delete reversal math.
 */
function simulateExpectedCols(entries, ordered, manual, splits) {
  const walk0 = simulateFifo(0, 0, entries, { isExternallyPaid: (s) => s._external })
  let legP = -walk0.uncovered.private
  let legG = -walk0.uncovered.group
  const manualIds = new Set(manual.map(p => p.id))
  const expected = new Map()
  for (const s of splits) {
    if (!manualIds.has(s.payment.id)) continue
    const settlePart = planSettlement(s.covered.private, s.covered.group, legP, legG)
    legP += settlePart.settled_private
    legG += settlePart.settled_group
    const creditPart = planSettlement(s.credit.private, s.credit.group, legP, legG)
    legP += creditPart.settled_private
    legG += creditPart.settled_group
    expected.set(s.payment.id, {
      settled_private: settlePart.settled_private + creditPart.settled_private,
      settled_group: settlePart.settled_group + creditPart.settled_group,
      credited_private: creditPart.credited_private,
      credited_group: creditPart.credited_group,
    })
  }
  return expected
}

async function main() {
  console.log(`source: ${SOURCE} (${APPLY ? 'APPLY' : 'report'})`)

  const players = (await db.findAll('users', u => u.role === 'player')).sort((a, b) => a.id - b.id)
  const allPayments = await db.findAll('payments')
  const allSlots = await db.findAll('slots')
  const bookingById = new Map((await db.findAll('bookings')).map(b => [b.id, b]))
  const report = []

  for (const player of players) {
    const manual = allPayments
      .filter(p => p.player_id === player.id && p.status === 'payment_approved' && !p.booking_id)
      .sort(byChrono)
    const ordered = allPayments
      .filter(p => p.player_id === player.id && p.status === 'payment_approved')
      .sort(byChrono)

    const entries = buildEntries(player, allSlots, allPayments, bookingById)

    // mirror safety: same walk must agree with the sessions list
    const totals = ordered.reduce((t, p) => ({ p: t.p + (p.private_sessions || 0), g: t.g + (p.group_sessions || 0) }), { p: 0, g: 0 })
    const walk = simulateFifo(totals.p, totals.g, entries, { isExternallyPaid: (s) => s._external })
    const { unpaidPrivate, unpaidGroup, amountOwed } = await computePlayerSessions(player)
    if (walk.uncovered.private !== unpaidPrivate || walk.uncovered.group !== unpaidGroup) {
      console.error(`MIRROR MISMATCH player ${player.id} ${player.name}: walk uncovered ${walk.uncovered.private}/${walk.uncovered.group} vs sessions ${unpaidPrivate}/${unpaidGroup}`)
      await getKnex().destroy()
      process.exit(2)
    }
    const target = {
      credit: walk.remaining,
      debt: { private: -walk.uncovered.private, group: -walk.uncovered.group },
    }

    const live = isCycleLive(player)
    const curLeg = { private: Number(player.private_balance) || 0, group: Number(player.group_balance) || 0 }
    const curCyc = live ? { private: Number(player.cycle_private) || 0, group: Number(player.cycle_group) || 0 } : { private: 0, group: 0 }
    const effNow = { private: Math.max(0, curLeg.private) + curCyc.private, group: Math.max(0, curLeg.group) + curCyc.group }

    const { splits, clamped } = cumulativeSplits(ordered, entries)
    const splitById = new Map(splits.map(s => [s.payment.id, s]))
    const expectedCols = simulateExpectedCols(entries, ordered, manual, splits)

    const colsChanged = manual.filter(p => {
      const e = expectedCols.get(p.id)
      if (!e) return false
      return (p.settled_private ?? null) !== e.settled_private ||
        (p.settled_group ?? null) !== e.settled_group ||
        (p.credited_private ?? null) !== e.credited_private ||
        (p.credited_group ?? null) !== e.credited_group
    })

    const stateDrift = effNow.private !== target.credit.private || effNow.group !== target.credit.group ||
      curLeg.private !== target.debt.private || curLeg.group !== target.debt.group

    // value now that is NOT backed by the payment pool (phantom/legacy) — removed by trim
    const excess = {
      private: Math.max(0, effNow.private - target.credit.private),
      group: Math.max(0, effNow.group - target.credit.group),
    }
    const deficit = {
      private: Math.max(0, target.credit.private - effNow.private),
      group: Math.max(0, target.credit.group - effNow.group),
    }

    const skipped = manual.length === 0
    const drifted = !skipped && (stateDrift || colsChanged.length > 0)

    report.push({
      id: player.id, name: player.name,
      payments: manual.length,
      now: { leg: curLeg, cyc: live ? { ...curCyc, key: player.cycle_key } : null, eff: effNow },
      target,
      colsChanged: colsChanged.map(p => ({
        id: p.id, ref: p.ref, date: p.date,
        from: { settled: [p.settled_private, p.settled_group], credited: [p.credited_private, p.credited_group] },
        to: { settled: [expectedCols.get(p.id).settled_private, expectedCols.get(p.id).settled_group], credited: [expectedCols.get(p.id).credited_private, expectedCols.get(p.id).credited_group] },
        split: { covered: [splitById.get(p.id).covered.private, splitById.get(p.id).covered.group], credit: [splitById.get(p.id).credit.private, splitById.get(p.id).credit.group] },
      })),
      stateDrift, clamped, skipped, drifted, excess, deficit,
      unpaid: { private: unpaidPrivate, group: unpaidGroup, amount: amountOwed },
    })
  }

  // ── print ────────────────────────────────────────────────────────────────
  console.log('\n=== RECONCILE (pooled FIFO = sessions list = receipts) ===')
  console.log('id name | pays | now: leg cyc -> eff | target: credit / debt | cols | state')
  for (const r of report) {
    if (r.skipped) continue
    const cyc = r.now.cyc ? `${r.now.cyc.private}/${r.now.cyc.group}(${r.now.cyc.key})` : '-'
    const mark = r.drifted ? [r.stateDrift && 'STATE', r.colsChanged.length && 'COLS'].filter(Boolean).join('+') : 'ok'
    const exc = (r.excess.private || r.excess.group) ? ` EXCESS ${r.excess.private}P/${r.excess.group}G` : ''
    const def = (r.deficit.private || r.deficit.group) ? ` DEFICIT ${r.deficit.private}P/${r.deficit.group}G` : ''
    console.log(`${r.id} ${r.name} | ${r.payments} | ${r.now.leg.private}/${r.now.leg.group} ${cyc} -> ${r.now.eff.private}/${r.now.eff.group} | ${r.target.credit.private}/${r.target.credit.group} / ${r.target.debt.private}/${r.target.debt.group} | ${r.colsChanged.length} | ${mark}${exc}${def}${r.clamped ? ' (clamped)' : ''}`)
    for (const c of r.colsChanged) console.log(`     pay#${c.id} ${c.ref} ${c.date}: settled ${c.from.settled}→${c.to.settled} credited ${c.from.credited}→${c.to.credited}`)
  }
  const drifted = report.filter(r => r.drifted)
  const skipped = report.filter(r => r.skipped)
  console.log(`\nplayers: ${report.length} | drifted: ${drifted.length} | ok: ${report.length - drifted.length - skipped.length} | skipped (no manual payment): ${skipped.length}`)
  const excessRows = report.filter(r => r.excess.private || r.excess.group)
  if (excessRows.length) {
    console.log(`EXCESS (value now, not backed by payment pool — removed by repair): ${excessRows.length} players`)
    for (const r of excessRows) console.log(`   ${r.id} ${r.name}: ${r.excess.private}P/${r.excess.group}G`)
  }
  if (skipped.length) console.log(`skipped: ${skipped.map(s => `${s.id} ${s.name}`).join(', ')}`)

  const outDir = join(__dirname, 'payments-backups')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `reconcile-${SOURCE}-${TS}.json`)
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: SOURCE, report }, null, 2))
  console.log(`json: ${outPath}`)

  if (!APPLY) {
    console.log('\n(dry run — pass --apply to repair)')
    await getKnex().destroy()
    return
  }

  // ── apply ────────────────────────────────────────────────────────────────
  const backup = { at: new Date().toISOString(), users: [], payments: [] }
  for (const r of drifted) {
    const before = await db.get('users', r.id)
    backup.users.push({
      id: r.id, private_balance: before.private_balance, group_balance: before.group_balance,
      cycle_private: before.cycle_private, cycle_group: before.cycle_group,
      cycle_key: before.cycle_key, cycle_expires_at: before.cycle_expires_at,
      cycle_private_paid: before.cycle_private_paid, cycle_group_paid: before.cycle_group_paid,
      balance_zero_since: before.balance_zero_since,
    })
    for (const p of allPayments.filter(x => x.player_id === r.id && !x.booking_id && x.status === 'payment_approved')) {
      backup.payments.push({ id: p.id, settled_private: p.settled_private, settled_group: p.settled_group, credited_private: p.credited_private, credited_group: p.credited_group })
    }
  }
  const backupPath = join(outDir, `reconcile-backup-${SOURCE}-${TS}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`backup: ${backupPath}`)

  const { auditLog } = await import('../server/src/middleware/audit.js')

  let repaired = 0
  for (const r of drifted) {
    const beforeSnap = {
      private_balance: r.now.leg.private, group_balance: r.now.leg.group,
      cycle_private: r.now.cyc ? r.now.cyc.private : 0, cycle_group: r.now.cyc ? r.now.cyc.group : 0,
    }

    // 1) lazy-expire exactly like the runtime
    await ensureCycleFresh(r.id, { notify: false })

    // 2) RE-SEED to the empty-pool truth: legacy = -uncovered(no credit), cycle
    //    zeroed. Deterministic base — same for ANY starting balance, so state
    //    and columns converge exactly in one pass (reverse-and-floor loops).
    const entries = buildEntries(playerById(r.id), allSlots, allPayments, bookingById)
    const walk0 = simulateFifo(0, 0, entries, { isExternallyPaid: (s) => s._external })
    await db.update('users', r.id, {
      private_balance: -walk0.uncovered.private,
      group_balance: -walk0.uncovered.group,
      cycle_private: 0, cycle_group: 0,
      cycle_key: null, cycle_expires_at: null,
      cycle_private_paid: 0, cycle_group_paid: 0,
      balance_zero_since: null,
    })

    const manual = allPayments
      .filter(p => p.player_id === r.id && p.status === 'payment_approved' && !p.booking_id)
      .sort(byChrono)

    // 3) re-apply oldest→newest with corrected splits (routes' applyAllocation math)
    const ordered = allPayments
      .filter(p => p.player_id === r.id && p.status === 'payment_approved')
      .sort(byChrono)
    const { splits } = cumulativeSplits(ordered, entries)
    const paidIds = new Set(manual.map(p => p.id))
    for (const s of splits) {
      if (!paidIds.has(s.payment.id)) continue // booking rows keep their columns untouched
      const settled = await settleDebtWith(r.id, s.covered.private, s.covered.group)
      const credit = await creditCycle(r.id, s.credit.private, s.credit.group)
      const creditSettlement = credit?.settlement || EMPTY_SETTLEMENT
      const settledPart = settled?.settlement || EMPTY_SETTLEMENT
      const settlement = {
        settled_private: (settledPart.settled_private || 0) + (creditSettlement.settled_private || 0),
        settled_group: (settledPart.settled_group || 0) + (creditSettlement.settled_group || 0),
        credited_private: creditSettlement.credited_private || 0,
        credited_group: creditSettlement.credited_group || 0,
      }
      await db.update('payments', s.payment.id, {
        settled_private: settlement.settled_private,
        settled_group: settlement.settled_group,
        credited_private: settlement.credited_private,
        credited_group: settlement.credited_group,
      })
    }

    // 4) trim to the pooled target (exactness net): debt lives in legacy,
    //    credit ALWAYS in a current-cycle bucket (never merged into legacy —
    //    eff = max(0, legacy) + cycle would silently drop part of it)
    const t = r.target
    const u = await db.get('users', r.id)
    const live = isCycleLive(u)
    const key = currentCycleKey()
    const sameLive = live && u.cycle_key === key
    const cycP = t.credit.private
    const cycG = t.credit.group
    const updates = {
      private_balance: t.debt.private,
      group_balance: t.debt.group,
      cycle_private: cycP,
      cycle_group: cycG,
    }
    if (cycP > 0 || cycG > 0) {
      updates.cycle_key = key
      updates.cycle_expires_at = cycleExpiryFor(key)
      updates.cycle_private_paid = sameLive ? Math.max(Number(u.cycle_private_paid) || 0, cycP) : cycP
      updates.cycle_group_paid = sameLive ? Math.max(Number(u.cycle_group_paid) || 0, cycG) : cycG
    } else if (live) {
      updates.cycle_private_paid = Number(u.cycle_private_paid) || 0
      updates.cycle_group_paid = Number(u.cycle_group_paid) || 0
    }
    const zero = t.debt.private === 0 && t.debt.group === 0 && cycP === 0 && cycG === 0
    updates.balance_zero_since = zero ? new Date().toISOString() : null
    await db.update('users', r.id, updates)

    await auditLog({
      req: null, action: 'balance.reconcile', targetType: 'user', targetId: r.id,
      before: beforeSnap,
      after: { private_balance: t.debt.private, group_balance: t.debt.group, cycle_private: cycP, cycle_group: cycG, colsChanged: r.colsChanged.length, paymentIds: manual.map(p => p.id) },
    })

    // verify: legacy == debt, cycle == credit (credit must sit in the current cycle)
    const v = await db.get('users', r.id)
    const creditNeedsCycle = t.credit.private > 0 || t.credit.group > 0
    const ok = (Number(v.private_balance) || 0) === t.debt.private &&
      (Number(v.group_balance) || 0) === t.debt.group &&
      (Number(v.cycle_private) || 0) === t.credit.private &&
      (Number(v.cycle_group) || 0) === t.credit.group &&
      (!creditNeedsCycle || (v.cycle_key === currentCycleKey() && isCycleLive(v)))
    const vCycP = Number(v.cycle_private) || 0
    const vCycG = Number(v.cycle_group) || 0
    console.log(`${ok ? 'OK  ' : 'FAIL'} player ${r.id} ${r.name}: leg ${v.private_balance}/${v.group_balance} cyc ${vCycP}/${vCycG} (${v.cycle_key || '-'}) vs target credit ${t.credit.private}/${t.credit.group} debt ${t.debt.private}/${t.debt.group}`)
    if (ok) repaired++
  }

  console.log(`\nrepaired ${repaired}/${drifted.length}`)
  await getKnex().destroy()
  if (repaired !== drifted.length) process.exit(1)
}

const playerCache = new Map()
function playerById(id) {
  if (!playerCache.has(id)) throw new Error('playerById: not prefetched ' + id)
  return playerCache.get(id)
}

async function prefetchPlayers() {
  const players = await db.findAll('users', u => u.role === 'player')
  for (const p of players) playerCache.set(p.id, p)
}

await prefetchPlayers()
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('reconcile failed:', err)
    getKnex().destroy().catch(() => {}).finally(() => process.exit(1))
  })
