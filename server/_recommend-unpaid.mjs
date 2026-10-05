/**
 * READ-ONLY recommendation: for every unpaid player, map unpaid sessions to
 * the nearest private package tier (1/4/8/12/16), plus the round-up tier the
 * receipt should recommend as "clear everything" option.
 *
 *   p_equiv  = P + G/2  (settlement rule 1P = 2G)
 *   nearest  = argmin |p_equiv - t|, tie -> larger tier (favor covering)
 *   round_up = smallest tier >= p_equiv (receipt upsell)
 *
 * Remainder is a FAITHFUL FIFO simulation: re-runs the sessionPaid engine
 * with an extra approved payment (private_sessions = nearest tier) injected
 * into the pools — exactly what POST /payments would produce, minus writes.
 * computePaymentAllocation preview kept alongside for comparison.
 *
 * Usage:  cd server && node _recommend-unpaid.mjs [--json out.json]
 * NEVER WRITES. Uses local PG (server/.env DB_HOST=localhost mmacademy).
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'

process.env.DB_ENABLED = 'true'
delete process.env.DATABASE_URL // local .env only — never prod

const { computeUnpaidPlayers } = await import('./src/utils/sessionPaid.js')
const { computePaymentAllocation } = await import('./src/utils/paymentAllocation.js')
const { PRICING, packagePrice } = await import('./src/utils/pricing.js')
const { default: db } = await import('./src/db.js')

const TIERS = [1, 4, 8, 12, 16]

function nearestTier(pEquiv) {
  let best = TIERS[0]
  for (const t of TIERS) {
    const d = Math.abs(t - pEquiv)
    const db2 = Math.abs(best - pEquiv)
    if (d < db2 || (d === db2 && t > best)) best = t
  }
  return best
}
function roundUpTier(pEquiv) {
  for (const t of TIERS) if (t >= pEquiv - 1e-9) return t
  return null // >16 → 16 + singles
}

/**
 * Faithful post-application FIFO: same engine as computePlayerSessions but
 * with an extra approved payment (extraPriv/extraGrp) added to the pools.
 * Returns { sessions, unpaidPrivate, unpaidGroup, amountOwed }.
 */
async function simulatePostPayment(player, extraPriv = 0, extraGrp = 0) {
  const playerName = (player.name || '').toLowerCase()
  const allSlots = await db.findAll('slots')
  const playerSlots = allSlots
    .filter(s => {
      if (!s.player_text) return false
      return s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase()).includes(playerName)
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const payments = (await db.findAll('payments'))
    .filter(p => p.player_id === player.id && p.status === 'payment_approved')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let poolPriv = extraPriv
  let poolGrp = extraGrp
  for (const p of payments) {
    poolPriv += p.private_sessions || 0
    poolGrp += p.group_sessions || 0
  }

  const sessions = []
  for (const s of playerSlots) {
    const booking = s.booking_id ? await db.get('bookings', s.booking_id) : null
    const directPayment = booking
      ? await db.find('payments', p => p.booking_id === booking.id && p.status === 'payment_approved')
      : null
    const sessionType = s.session_type || (booking ? booking.session_type : null) || 'private'
    let paid = false
    if (directPayment || booking?.paid) paid = true
    else if (s.status === 'payment_approved') paid = true
    else if (sessionType === 'private') {
      if (poolPriv > 0) { poolPriv--; paid = true }
      else if (poolGrp >= 2) { poolGrp -= 2; paid = true }
    } else {
      if (poolGrp > 0) { poolGrp--; paid = true }
      else if (poolPriv > 0) { poolPriv--; poolGrp += 1; paid = true }
    }
    sessions.push({ date: s.date, time: s.time, court: s.court, session_type: sessionType, paid, status: s.status })
  }
  sessions.reverse()
  const unpaidPrivate = sessions.filter(s => !s.paid && s.session_type !== 'group').length
  const unpaidGroup = sessions.filter(s => !s.paid && s.session_type === 'group').length
  return { sessions, unpaidPrivate, unpaidGroup, amountOwed: packagePrice(unpaidPrivate, unpaidGroup), leftoverPriv: poolPriv, leftoverGrp: poolGrp }
}

const unpaid = await computeUnpaidPlayers()
const rows = []
let totOwed = 0, totNearestPrice = 0, totRoundPrice = 0, totRemainder = 0, totSimRemainder = 0

for (const p of unpaid) {
  const P = p.unpaid_private, G = p.unpaid_group
  const pEquiv = P + G / 2
  const nearest = nearestTier(pEquiv)
  const priceNearest = PRICING.private[nearest]
  const roundUp = roundUpTier(pEquiv)
  const priceRound = roundUp ? PRICING.private[roundUp] : Math.ceil(pEquiv / 16) * PRICING.private[16]
  const roundOver = roundUp ? Math.max(0, roundUp - pEquiv) : pEquiv % 16

  const alloc = await computePaymentAllocation(
    { id: p.id, name: p.name },
    { amount: priceNearest, private_sessions: nearest, group_sessions: 0 }
  )
  const sim = await simulatePostPayment(p, nearest, 0)

  const row = {
    id: p.id,
    name: p.name,
    unpaid_private: P,
    unpaid_group: G,
    p_equiv: pEquiv,
    amount_owed: p.amount_owed,
    nearest_tier: nearest,
    nearest_price: priceNearest,
    covers_debt: priceNearest >= p.amount_owed,
    sim: {
      remainder_private: sim.unpaidPrivate,
      remainder_group: sim.unpaidGroup,
      remainder_amount: sim.amountOwed,
      leftover_private: sim.leftoverPriv,
      leftover_group: sim.leftoverGrp,
      post_paid_count: sim.sessions.filter(s => s.paid).length,
      post_total_count: sim.sessions.length,
    },
    alloc_preview: {
      covered_private: alloc.covered_private,
      covered_group: alloc.covered_group,
      credit_private: alloc.credit_private,
      credit_group: alloc.credit_group,
      remainder_amount: alloc.remaining_unpaid.amount,
    },
    roundup_tier: roundUp,
    roundup_price: priceRound,
    roundup_surplus: roundOver,
  }
  rows.push(row)
  totOwed += p.amount_owed
  totNearestPrice += priceNearest
  totRoundPrice += priceRound
  totRemainder += alloc.remaining_unpaid.amount
  totSimRemainder += sim.amountOwed
}

rows.sort((a, b) => b.amount_owed - a.amount_owed)

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)
console.log('\nUNPAID -> NEAREST PRIVATE PACKAGE (read-only recommendation, FIFO-simulated)\n')
console.log(
  pad('#', 3) + pad('Player', 22) + padL('P', 3) + padL('G', 3) + padL('Eqv', 6) +
  padL('Owed EGP', 10) + pad('-> Pkg', 8) + padL('Price', 9) +
  padL('Paid after', 11) + padL('Left P', 7) + padL('Left G', 7) + padL('Still EGP', 10) +
  pad('  | Receipt pkg', 18) + padL('Price', 9) + padL('Over', 5)
)
console.log('-'.repeat(165))
rows.forEach((r, i) => {
  const s = r.sim
  console.log(
    pad(i + 1, 3) + pad(r.name, 22) + padL(r.unpaid_private, 3) + padL(r.unpaid_group, 3) + padL(r.p_equiv, 6) +
    padL(r.amount_owed.toLocaleString('en-US'), 10) + pad('-> ' + r.nearest_tier, 8) + padL(r.nearest_price.toLocaleString('en-US'), 9) +
    padL(`${s.post_paid_count}/${s.post_total_count}`, 11) + padL(s.remainder_private, 7) + padL(s.remainder_group, 7) +
    padL(s.remainder_amount.toLocaleString('en-US'), 10) +
    pad('  | ' + (r.roundup_tier ?? '>16'), 18) + padL(r.roundup_price.toLocaleString('en-US'), 9) + padL(r.roundup_surplus ? '+' + r.roundup_surplus : '-', 5)
  )
})
console.log('-'.repeat(165))
console.log(
  'TOTALS'.padEnd(46) + padL(totOwed.toLocaleString('en-US'), 10) + padL(totNearestPrice.toLocaleString('en-US'), 17) +
  padL('rem ' + totSimRemainder.toLocaleString('en-US'), 28) +
  ' | round-up ' + totRoundPrice.toLocaleString('en-US') + ' EGP'
)
console.log(`\n${rows.length} unpaid players. Simulated remainder after applying nearest pkg: ${totSimRemainder.toLocaleString('en-US')} EGP (was ${totOwed.toLocaleString('en-US')}).`)

const jsonIdx = process.argv.indexOf('--json')
if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(rows, null, 2))
  console.log(`JSON written: ${process.argv[jsonIdx + 1]}`)
}
process.exit(0)
