/**
 * PROD READ-ONLY probe: why 1 Farida slot counts as paid, and how Dima's
 * 4,000 EGP maps onto credited sessions. Prints raw rows + engine result.
 */
import 'dotenv/config'
process.env.DB_ENABLED = 'true'
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL

const { computePlayerSessions } = await import('./src/utils/sessionPaid.js')
const { computePaymentAllocation } = await import('./src/utils/paymentAllocation.js')
const { default: db } = await import('./src/db.js')

const users = await db.findAll('users')
const payments = await db.findAll('payments')
const slots = await db.findAll('slots')

for (const needle of ['dima', 'farida']) {
  const u = users.find(x => (x.name || '').toLowerCase().includes(needle) && x.role === 'player')
  console.log(`\n================ ${needle.toUpperCase()} (${u ? u.id + ' ' + u.name : 'NOT FOUND'}) ================`)
  if (!u) continue

  console.log('--- payment rows (ALL statuses) ---')
  const rows = payments.filter(p => p.player_id === u.id)
  if (!rows.length) console.log('  (none)')
  for (const p of rows) {
    console.log(`  #${p.id} status=${p.status} amount=${p.amount} P=${p.private_sessions} G=${p.group_sessions} date=${p.date} booking_id=${p.booking_id ?? '-'} created=${p.created_at ?? p.createdAt ?? '-'}`)
  }

  const mine = slots.filter(s => (s.player_text || '').toLowerCase().includes(needle))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  console.log(`--- slots (${mine.length}) in chronological order ---`)
  for (const s of mine) {
    console.log(`  slot#${s.id} ${s.date} ${s.time} ${s.court} ${s.session_type || '?'} status=${s.status} booking=${s.booking_id ?? '-'}`)
  }

  const rep = await computePlayerSessions(u)
  console.log(`--- engine: total=${rep.sessions.length} unpaidP=${rep.unpaidPrivate} unpaidG=${rep.unpaidGroup} owed=${rep.amountOwed} ---`)
  for (const s of rep.sessions) {
    console.log(`  ${s.date} ${s.time} ${s.session_type} paid=${s.paid} via=${s.paid_via} status=${s.status}`)
  }

  const paidSum = rows.filter(p => p.status === 'payment_approved')
  console.log(`--- approved money total = ${paidSum.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0)}; credited P/G from stored counts = ${paidSum.reduce((a, p) => a + (p.private_sessions || 0), 0)}/${paidSum.reduce((a, p) => a + (p.group_sessions || 0), 0)} ---`)
  const preview = await computePaymentAllocation(u, { amount: paidSum.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0) })
  console.log(`--- if ALL approved money re-derived fresh: would credit P=${preview.private_sessions} G=${preview.group_sessions} (covered P=${preview.covered_private} G=${preview.covered_group} + credit P=${preview.credit_private} G=${preview.credit_group}) ---`)
}
await db.close?.()
