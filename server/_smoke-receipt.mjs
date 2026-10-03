import fs from 'node:fs'
import { generateReceiptPDF } from '../src/lib/receiptPDF.js'
import { packageAdvice } from '../src/lib/packageAdvice.js'

const run = (label, report, file) => {
  const doc = generateReceiptPDF(report)
  doc.save(file)
  return fs.readFileSync(file).toString('latin1')
}

const yasinSessions = []
const start = new Date('2026-09-01T00:00:00Z')
for (let i = 0; i < 12; i++) {
  const d = new Date(start.getTime() + i * 6 * 86400000)
  yasinSessions.push({
    date: d.toISOString().slice(0, 10),
    time: i % 2 === 0 ? '18:00' : '19:00',
    court: (i % 4) + 1,
    session_type: i < 6 ? 'private' : 'group',
    status: 'payment_approved',
    paid: false,
  })
}
const advice = packageAdvice(yasinSessions)
console.log('ADVICE:', JSON.stringify(advice))

const checks = [
  'Payment Statement',
  'MM Padel Academy',
  'Yasin Mahmoud',
  'PAID SESSIONS',
  '0 of 12',
  'YOU OWE',
  'EGP 8,400',
  '6 private sessions',
  'EGP 5,600',
  '6 group sessions',
  'EGP 2,800',
  'RECOMMENDED \u0097 BEST NEXT STEP',
  '12-Session Private Package',
  'EGP 10,800',
  'Covers all 12 sessions you owe',
  'plus 3 extra sessions credited',
  'Or the 8-Session Package',
  'EGP 7,000',
  'about EGP 1,400 still due after',
  'Pay by InstaPay or cash \u0097 details below.',
  'YOUR SESSIONS',
  'TIME & COURT',
  'Unpaid',
  'How to pay: InstaPay or cash at the academy',
  'ipn.eg/S/mahmoudaymannnn1998/instapay/3xPdPz',
  'Page 1 of 1',
  '6:00\u00967:00',
  'Court 1',
  '/Image',
]
const t = run('yasin', {
  player: { name: 'Yasin Mahmoud', email: 'yasin@example.com', phone: '+20 10 00915244', member_code: 'MM-0421' },
  sessions: yasinSessions,
  amount_owed: 8400,
}, 'server/backups/_receipt_smoke.pdf')

let miss = 0
for (const s of checks) {
  const ok = t.includes(s)
  if (!ok) miss++
  console.log((ok ? 'OK  ' : 'MISS') + ' | ' + JSON.stringify(s))
}

const many = []
for (let i = 0; i < 40; i++) {
  const d = new Date(start.getTime() + i * 2 * 86400000)
  many.push({ date: d.toISOString().slice(0, 10), time: '18:00', court: (i % 4) + 1, session_type: 'private', status: 'payment_approved', paid: i < 30 })
}
const t2 = run('many', { player: { name: 'Multi Page Player' }, sessions: many, amount_owed: 10000 }, 'server/backups/_receipt_smoke2.pdf')
for (const s of ['Page 2 of 2', 'continued', 'Paid', 'Unpaid', 'EGP 10,000']) {
  const ok = t2.includes(s)
  if (!ok) miss++
  console.log((ok ? 'OK  ' : 'MISS') + ' | multi: ' + JSON.stringify(s))
}
{
  const ok = !t2.includes('still due after')
  if (!ok) miss++
  console.log((ok ? 'OK  ' : 'MISS') + ' | multi-absent: "still due after" (nearest == roundUp)')
}

const t3 = run('empty', { player: { name: 'Empty Player' }, sessions: [], amount_owed: 0 }, 'server/backups/_receipt_smoke3.pdf')
for (const s of ['Empty Player', 'No sessions recorded yet.', 'Page 1 of 1']) {
  const ok = t3.includes(s)
  if (!ok) miss++
  console.log((ok ? 'OK  ' : 'MISS') + ' | empty: ' + JSON.stringify(s))
}
for (const s of ['WHAT YOU OWE', 'BEST NEXT STEP']) {
  const absent = !t3.includes(s)
  if (!absent) miss++
  console.log((absent ? 'OK  ' : 'MISS') + ' | empty-absent: ' + JSON.stringify(s))
}

// Multi-pack fixture: Farida-like 18 private + 3 group = 19.5 pEquiv > 16
const faridaSessions = []
for (let i = 0; i < 21; i++) {
  const d = new Date(start.getTime() + i * 3 * 86400000)
  faridaSessions.push({
    date: d.toISOString().slice(0, 10),
    time: '18:00',
    court: (i % 4) + 1,
    session_type: i < 18 ? 'private' : 'group',
    status: 'payment_approved',
    paid: false,
  })
}
const faridaAdvice = packageAdvice(faridaSessions)
console.log('FARIDA ADVICE:', JSON.stringify(faridaAdvice))
const t4 = run('farida', {
  player: { name: 'Farida Hassan' },
  sessions: faridaSessions,
  amount_owed: 17500,
}, 'server/backups/_receipt_smoke4.pdf')
for (const s of [
  'BEST NEXT STEP \u0097 PAY IN TWO STEPS',
  '16-Session Private Package',
  'EGP 14,000',
  'Step 1, pay now \u0097 covers most of your 21 sessions.',
  'Step 2, next month \u0097 about EGP 3,500 left: 4-Session Package, EGP 3,600.',
  'Or clear everything at once: 2 \u00D7 16-Session Package \u0097 EGP 28,000.',
  'Pay by InstaPay or cash \u0097 details below.',
]) {
  const ok = t4.includes(s)
  if (!ok) miss++
  console.log((ok ? 'OK  ' : 'MISS') + ' | multipack: ' + JSON.stringify(s))
}
for (const s of ['16 + singles', 'Or pay any amount', 'extra sessions credited']) {
  const absent = !t4.includes(s)
  if (!absent) miss++
  console.log((absent ? 'OK  ' : 'MISS') + ' | multipack-absent: ' + JSON.stringify(s))
}
for (const [lbl, txt] of [['yasin', t], ['multi', t2], ['empty', t3], ['multipack', t4]]) {
  for (const s of ['Or pay any amount', 'carries to next month', 'WHAT YOU OWE']) {
    const absent = !txt.includes(s)
    if (!absent) miss++
    console.log((absent ? 'OK  ' : 'MISS') + ` | ${lbl}-absent: ` + JSON.stringify(s))
  }
}

console.log(miss ? `${miss} MISSING` : 'ALL PRESENT')
process.exit(miss ? 1 : 0)
