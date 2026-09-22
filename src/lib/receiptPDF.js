import jsPDF from 'jspdf'

export function generateReceiptPDF(reportData) {
  const { player, sessions, amount_owed } = reportData
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('MM Padel Academy', 14, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Session Report & Statement', 14, 26)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 32)

  // Player info
  let y = 45
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Player Details', 14, y)
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Name: ${player.name}`, 14, y); y += 6
  if (player.email) { doc.text(`Email: ${player.email}`, 14, y); y += 6 }
  if (player.phone) { doc.text(`Phone: ${player.phone}`, 14, y); y += 6 }

  // Amount owed summary box
  y += 4
  if (amount_owed > 0) {
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(14, y, pageWidth - 28, 16, 3, 3, 'F')
    doc.setFillColor(217, 119, 6)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Amount Owed: EGP ${amount_owed.toLocaleString()}`, 20, y + 10)
  } else {
    doc.setFillColor(209, 250, 229)
    doc.roundedRect(14, y, pageWidth - 28, 16, 3, 3, 'F')
    doc.setTextColor(22, 101, 52)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('All sessions paid - No balance due', 20, y + 10)
  }
  y += 22

  // Session history table header
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Session History', 14, y)
  y += 8

  // Table header
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y - 4, pageWidth - 28, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Date', 16, y)
  doc.text('Time', 42, y)
  doc.text('Court', 68, y)
  doc.text('Type', 88, y)
  doc.text('Status', 110, y)
  doc.text('Paid', 140, y)
  y += 6

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  for (const s of sessions) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.text(s.date || '-', 16, y)
    doc.text(s.time || '-', 42, y)
    doc.text(`C${s.court}`, 68, y)
    doc.text(s.session_type || '-', 88, y)
    doc.text(s.status || '-', 110, y)
    if (s.paid) {
      doc.setTextColor(22, 101, 52)
      doc.text('Paid', 140, y)
    } else {
      doc.setTextColor(220, 38, 38)
      doc.text('Unpaid', 140, y)
      doc.setTextColor(30, 41, 59)
    }
    y += 5
  }

  // Footer
  y += 8
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, pageWidth - 14, y)
  y += 6
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('MM Padel Academy - Session Report', 14, y)
  doc.text(`Page 1 of ${doc.getNumberOfPages()}`, pageWidth - 40, y)

  return doc
}
