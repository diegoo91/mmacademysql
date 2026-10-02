import { jsPDF } from 'jspdf'
import { calculatePrice, PRICING } from '../data/pricingData.js'
import { CONTACT, ACADEMY_NAME, TAGLINE } from '../data/siteConfig.js'
import { formatSlotTime } from './time.js'
import { packageAdvice } from './packageAdvice.js'
import { LOGO_DATA_URL } from '../assets/logoData.js'

/**
 * Player-facing A4 statement — designed to be understood at a glance:
 *   - academy logo + name in the brand header (and on continuation pages)
 *   - one summary card: "Paid X of Y" and "You owe EGP Z"
 *   - "What you owe" broken into private/group lines (package priced)
 *   - "Best next step": the round-up package that clears everything
 *   - sessions table with only 4 plain columns (Paid / Unpaid)
 *   - short "how to pay" note, contact footer, page X of Y
 */

const C = {
  green: [0, 168, 107],
  greenDark: [0, 143, 90],
  greenText: [22, 101, 52],
  gold: [196, 154, 69],
  goldDark: [146, 111, 44],
  ink: [13, 27, 24],
  muted: [107, 114, 128],
  line: [226, 232, 240],
  headerBg: [241, 245, 249],
  zebra: [248, 250, 252],
  amberBg: [255, 251, 235],
  amberLine: [245, 222, 140],
  amberText: [180, 83, 9],
  rose: [220, 38, 38],
  white: [255, 255, 255],
  paleGreen: [236, 253, 245],
}

const M = 14 // left margin (mm)
const RIGHT = 196 // right edge (A4 210 - 14)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const egp = (n) => `EGP ${(Number(n) || 0).toLocaleString('en-US')}`
const fmtDate = (d) => {
  const [y, m, day] = String(d || '').split('-')
  if (!y || !m || !day) return String(d || '—')
  return `${day} ${MONTHS[Number(m) - 1] || m} ${y}`
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function sectionLabel(doc, text, x, y, color = C.goldDark) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...color)
  doc.text(text.toUpperCase(), x, y)
}

function logoBadge(doc, x, y, size) {
  doc.addImage(LOGO_DATA_URL, 'PNG', x, y, size, size)
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.4)
  doc.rect(x, y, size, size)
}

function brandHeader(doc, generated) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...C.green)
  doc.rect(0, 0, w, 30, 'F')
  doc.setFillColor(...C.gold)
  doc.rect(0, 30, w, 1.2, 'F')

  logoBadge(doc, M, 6, 18)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text(ACADEMY_NAME, M + 23, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(222, 247, 237)
  doc.text('Payment Statement', M + 23, 19.5)
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(TAGLINE, M + 23, 24.5)

  doc.setFontSize(8)
  doc.text(`Generated ${generated}`, RIGHT, 14, { align: 'right' })
  doc.setFontSize(7)
  doc.text('Sheikh Zayed, Giza', RIGHT, 18.5, { align: 'right' })
}

function continuedHeader(doc) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...C.green)
  doc.rect(0, 0, w, 14, 'F')
  doc.setFillColor(...C.gold)
  doc.rect(0, 14, w, 0.8, 'F')
  logoBadge(doc, M, 3, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.white)
  doc.text(ACADEMY_NAME, M + 11, 8.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('Statement (continued)', M + 58, 8.5)
}

function ensureSpace(doc, y, needed, state) {
  const bottom = state.bottom ?? 274
  if (y + needed <= bottom) return y
  doc.addPage()
  continuedHeader(doc)
  state.afterBreak = true
  return 24
}

function summaryCard(doc, y, advice, totalSessions, amountOwed) {
  const paid = totalSessions - advice.unpaidPrivate - advice.unpaidGroup
  doc.setFillColor(...C.headerBg)
  doc.roundedRect(M, y, RIGHT - M, 22, 2.5, 2.5, 'F')
  doc.setFillColor(...C.green)
  doc.rect(M, y, 1.4, 22, 'F')

  doc.setDrawColor(...C.line)
  doc.setLineWidth(0.4)
  doc.line(M + 91, y + 4, M + 91, y + 18)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.muted)
  doc.text('PAID SESSIONS', M + 7, y + 6.5)
  doc.setFontSize(15)
  doc.setTextColor(...C.greenText)
  doc.text(`${paid} of ${totalSessions}`, M + 7, y + 17)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.muted)
  doc.text('YOU OWE', M + 98, y + 6.5)
  doc.setFontSize(15)
  if (amountOwed > 0) {
    doc.setTextColor(...C.rose)
    doc.text(egp(amountOwed), M + 98, y + 17)
  } else {
    doc.setTextColor(...C.greenText)
    doc.text('All clear', M + 98, y + 17)
  }
  return y + 25
}

function oweBox(doc, y, advice, amountOwed) {
  doc.setFillColor(...C.amberBg)
  doc.setDrawColor(...C.amberLine)
  doc.setLineWidth(0.4)
  doc.roundedRect(M, y, RIGHT - M, 20, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.amberText)
  doc.text('WHAT YOU OWE', M + 5, y + 6)
  doc.setFontSize(14)
  doc.setTextColor(...C.ink)
  doc.text(egp(amountOwed), M + 5, y + 15.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.ink)
  const lines = []
  if (advice.unpaidPrivate) lines.push(`${plural(advice.unpaidPrivate, 'private session')} — ${egp(calculatePrice('private', advice.unpaidPrivate))}`)
  if (advice.unpaidGroup) lines.push(`${plural(advice.unpaidGroup, 'group session')} — ${egp(calculatePrice('group', advice.unpaidGroup))}`)
  lines.push('1 hour each · per player · package price')
  doc.text(lines, RIGHT - 5, y + 7, { align: 'right' })
  return y + 23
}

function nextStepBox(doc, y, advice, amountOwed) {
  if (!advice.hasUnpaid) return y

  const drawBox = (h) => {
    doc.setFillColor(...C.paleGreen)
    doc.setDrawColor(...C.green)
    doc.setLineWidth(0.5)
    doc.roundedRect(M, y, RIGHT - M, h, 2.5, 2.5, 'FD')
  }

  if (advice.roundUp === null) {
    // Debt above 16 equiv sessions: two-step plan leads, lump sum kept, no "pay any amount"
    const estStep1 = Math.max(0, Math.round((Number(amountOwed) || 0) - PRICING.private[16]))
    drawBox(34)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.greenText)
    doc.text('BEST NEXT STEP — PAY IN TWO STEPS', M + 5, y + 6)

    doc.setFontSize(12)
    doc.setTextColor(...C.ink)
    doc.text(`16-Session Private Package — ${egp(PRICING.private[16])}`, M + 5, y + 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    const totalUnpaid = advice.unpaidPrivate + advice.unpaidGroup
    doc.text(`Step 1, pay now — covers most of your ${plural(totalUnpaid, 'session')}.`, M + 5, y + 18.5)
    if (advice.secondStep) {
      doc.text(`Step 2, next month — about ${egp(estStep1)} left: ${advice.secondStep}-Session Package, ${egp(advice.secondStepPrice)}.`, M + 5, y + 23.5)
    }
    doc.text(`Or clear everything at once: ${advice.packsNeeded} \u00D7 16-Session Package — ${egp(advice.roundUpPrice)}.`, M + 5, y + 28.5)
    return y + 34 + 3
  }

  const splitOption = advice.nearest !== advice.roundUp
  const estRemainder = Math.max(0, Math.round((Number(amountOwed) || 0) - advice.nearestPrice))
  const h = splitOption ? 27 : 22
  drawBox(h)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.greenText)
  doc.text('BEST NEXT STEP', M + 5, y + 6)

  doc.setFontSize(12)
  doc.setTextColor(...C.ink)
  doc.text(`${advice.roundUp}-Session Private Package — ${egp(advice.roundUpPrice)}`, M + 5, y + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  const totalUnpaid = advice.unpaidPrivate + advice.unpaidGroup
  const covers = `Covers all ${plural(totalUnpaid, 'session')} you owe (${advice.unpaidPrivate} private + ${advice.unpaidGroup} group)`
  const extra = advice.roundUpSurplus > 0
    ? `, plus ${plural(advice.roundUpSurplus, 'extra session')} credited`
    : ' — exact match, nothing left over'
  doc.text(`${covers}${extra}.`, M + 5, y + 18.5)
  if (splitOption) {
    doc.text(`Or the ${advice.nearest}-Session Package — ${egp(advice.nearestPrice)} now (about ${egp(estRemainder)} still due after).`, M + 5, y + 23.5)
  }
  return y + h + 3
}

function settledBox(doc, y) {
  doc.setFillColor(...C.paleGreen)
  doc.setDrawColor(...C.green)
  doc.setLineWidth(0.4)
  doc.roundedRect(M, y, RIGHT - M, 13, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.greenText)
  doc.text('All sessions are paid — nothing owing. Enjoy your games!', M + 5, y + 8.5)
  return y + 16
}

const COLS = [
  { label: 'Date', x: M, w: 42 },
  { label: 'Time & Court', x: M + 42, w: 56 },
  { label: 'Type', x: M + 98, w: 44 },
  { label: 'Payment', x: M + 142, w: 40 },
]

function tableHeader(doc, y) {
  doc.setFillColor(...C.green)
  doc.rect(M, y, RIGHT - M, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.white)
  for (const c of COLS) doc.text(c.label.toUpperCase(), c.x + 3, y + 4.8)
  return y + 7
}

function sessionRows(doc, y, sessions, state) {
  if (!sessions.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...C.muted)
    doc.text('No sessions recorded yet.', M + 2, y + 6)
    return y + 10
  }
  y = tableHeader(doc, y)
  doc.setFontSize(8)
  sessions.forEach((s, i) => {
    y = ensureSpace(doc, y, 5.6, state)
    if (state.afterBreak) {
      y = tableHeader(doc, y)
      state.afterBreak = false
    }
    if (i % 2 === 1) {
      doc.setFillColor(...C.zebra)
      doc.rect(M, y, RIGHT - M, 5.6, 'F')
    }
    const rowY = y + 3.9
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.ink)
    doc.text(fmtDate(s.date), COLS[0].x + 3, rowY)
    const time = formatSlotTime(s.time) || '—'
    const court = s.court != null ? ` · Court ${s.court}` : ''
    doc.text(`${time}${court}`, COLS[1].x + 3, rowY)
    doc.text(s.session_type === 'group' ? 'Group' : 'Private', COLS[2].x + 3, rowY)
    if (s.paid) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.greenText)
      doc.text('Paid', COLS[3].x + 3, rowY)
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.rose)
      doc.text('Unpaid', COLS[3].x + 3, rowY)
    }
    y += 5.6
  })
  doc.setDrawColor(...C.line)
  doc.setLineWidth(0.3)
  doc.line(M, y, RIGHT, y)
  return y + 3
}

function paymentNote(doc, y, amountOwed) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  const lines = amountOwed > 0
    ? [
        'How to pay: InstaPay or cash at the academy. Send your transfer screenshot on WhatsApp',
        `(${CONTACT.whatsappLabel}) — your balance is updated after we confirm it.`,
        `InstaPay: ${CONTACT.instapayUrl.replace(/^https?:\/\//, '')}`,
      ]
    : [
        `Keep this statement for your records. Questions? WhatsApp ${CONTACT.whatsappLabel}`,
        CONTACT.hours,
      ]
  doc.text(lines, M, y + 4)
  return y + 4 * lines.length + 6
}

function footers(doc) {
  const pages = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C.line)
    doc.setLineWidth(0.3)
    doc.line(M, h - 14, w - M, h - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.muted)
    doc.text(`${ACADEMY_NAME} · ${CONTACT.phone} · ${CONTACT.hours}`, M, h - 9.5)
    doc.text(`Page ${i} of ${pages}`, w - M, h - 9.5, { align: 'right' })
  }
}

export function generateReceiptPDF(reportData) {
  const { player = {}, sessions = [], amount_owed = 0 } = reportData || {}
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const advice = packageAdvice(sessions)
  const owed = Number(amount_owed) || 0

  brandHeader(doc, generated)

  let y = 40
  sectionLabel(doc, 'Statement for', M, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...C.ink)
  doc.text(player.name || 'Player', M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.muted)
  const contactBits = [player.email, player.phone, player.member_code ? `Member #${player.member_code}` : null].filter(Boolean)
  if (contactBits.length) doc.text(contactBits.join('  ·  '), M, y + 5)
  y += 12

  y = summaryCard(doc, y, advice, sessions.length, owed)
  if (owed > 0) y = oweBox(doc, y, advice, owed)
  if (advice.hasUnpaid) y = nextStepBox(doc, y, advice, owed)
  else if (sessions.length) y = settledBox(doc, y)

  y += 2
  sectionLabel(doc, 'Your sessions', M, y)
  y += 3.5
  const state = { afterBreak: false, bottom: 274 - (owed > 0 ? 16 : 11) }
  y = sessionRows(doc, y, sessions, state)
  y += 2
  y = paymentNote(doc, y, owed)

  footers(doc)
  return doc
}
