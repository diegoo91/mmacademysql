import bcrypt from 'bcryptjs'
import XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from './database.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mmpadel.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required')
const ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin'

const existing = db.find('users', u => u.email === ADMIN_EMAIL)
if (existing) {
  console.log(`Admin ${ADMIN_EMAIL} already exists (id=${existing.id}). Updating...`)
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12)
  db.update('users', existing.id, { password_hash: hash, role: 'superadmin', force_password_change: 1 })
  console.log('Admin updated.')
} else {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12)
  const user = db.insert('users', {
    name: ADMIN_NAME, email: ADMIN_EMAIL, phone: '', dob: '',
    password_hash: hash, role: 'superadmin', skill_level: 'Intermediate',
    member_since: new Date().getFullYear().toString(), force_password_change: 1
  })
  console.log(`Admin seeded: ${ADMIN_EMAIL} (id=${user.id})`) // never log passwords
}

const MONTH_MAP = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

function parseTimeLabel(label) {
  const match = String(label).match(/(\d{1,2}):\d{2}[–-]/)
  if (!match) return null
  let hour = parseInt(match[1])
  if (hour < 12) hour += 12
  return `${String(hour).padStart(2, '0')}:00`
}

function parseSheetName(name) {
  const match = name.match(/(\d{1,2})-([A-Za-z]{3})/)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = MONTH_MAP[match[2]]
  if (!month) return null
  return `2026-${month}-${day}`
}

const NAME_ALIASES = {
  'farida fathala': 'Farida Fathallah',
  'farida fathalaah': 'Farida Fathallah',
  'yasin fathala': 'Yasin Fathallah',
  'yassin mahmoud': 'Yasin Mahmoud',
  'ammar abdelghany': 'Ammar Abd El Ghany',
  'titos': 'Totos',
  'ahmed salah': 'Ahmed Saleh',
  'hassan': 'Hassan Medhat',
  'zein': 'Zain',
}

function canonicalName(raw) {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  return NAME_ALIASES[lower] || trimmed
}

function splitCompoundName(text) {
  return text.split(/[/+]/).map(s => canonicalName(s.trim())).filter(Boolean)
}

function generateEmail(name) {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)
  return parts.join('.') + '@mmpadel.com'
}

const EXCEL_PATH = join(__dirname, 'data', 'MM_Padel_Academy_Schedule.xlsx')
let slotsCreated = 0
const allIndividualNames = new Set()

db.clear('slots')
console.log('Cleared existing slots.')

try {
  const wb = XLSX.readFile(EXCEL_PATH)
  const processedDates = new Set()

  for (const sheetName of wb.SheetNames) {
    if (sheetName.includes('(Wed)')) {
      const datePart = sheetName.split(' (')[0]
      const hasTue = wb.SheetNames.some(n => n.startsWith(datePart) && n.includes('(Tue)'))
      if (hasTue) {
        console.log(`Skipping duplicate sheet: ${sheetName} (using Tue version)`)
        continue
      }
    }

    const dateStr = parseSheetName(sheetName)
    if (!dateStr) {
      console.log(`Skipping sheet "${sheetName}": could not parse date`)
      continue
    }
    if (processedDates.has(dateStr)) continue
    processedDates.add(dateStr)

    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
    if (data.length < 2) continue

    const firstRowValues = Object.values(data[0]).map(v => String(v))
    const hasCourts = firstRowValues.some(v => v.includes('Court 1'))

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      const values = Object.values(row)
      const timeLabel = values[0]
      if (!timeLabel || timeLabel === 'Time Slot') continue

      const time = parseTimeLabel(timeLabel)
      if (!time) continue

      if (hasCourts) {
        const court1Raw = String(values[1] || '').trim()
        const court2Raw = String(values[2] || '').trim()

        if (court1Raw && court1Raw !== 'Available') {
          db.insert('slots', { date: dateStr, time, court: 1, player_text: court1Raw, booking_id: null })
          slotsCreated++
          splitCompoundName(court1Raw).forEach(n => allIndividualNames.add(n))
        }
        if (court2Raw && court2Raw !== 'Available') {
          db.insert('slots', { date: dateStr, time, court: 2, player_text: court2Raw, booking_id: null })
          slotsCreated++
          splitCompoundName(court2Raw).forEach(n => allIndividualNames.add(n))
        }
      } else {
        const playerRaw = String(values[1] || '').trim()
        if (playerRaw && playerRaw !== 'Available') {
          db.insert('slots', { date: dateStr, time, court: 1, player_text: playerRaw, booking_id: null })
          slotsCreated++
          splitCompoundName(playerRaw).forEach(n => allIndividualNames.add(n))
        }
      }
    }
    console.log(`Imported sheet: ${sheetName} → ${dateStr}`)
  }
} catch (err) {
  console.error('Failed to read schedule Excel:', err.message)
}

console.log(`Seeded ${slotsCreated} schedule slots from Excel.`)

const uniqueNames = [...allIndividualNames].sort()
let playersCreated = 0
for (const name of uniqueNames) {
  const email = generateEmail(name)
  if (db.find('users', u => u.email === email)) continue
  db.insert('users', {
    name, email, phone: '', dob: '',
    role: 'player', password_hash: null, is_claimed: false,
    skill_level: 'Intermediate', notes: '',
    private_balance: 0, group_balance: 0,
    member_since: new Date().getFullYear().toString(), force_password_change: 1,
  })
  playersCreated++
}
console.log(`Seeded ${playersCreated} player-users from schedule.`)

const allBookings = db.findAll('bookings')
for (const b of allBookings) {
  if (b.paid === undefined || b.paid === null) {
    const isCompleted = b.status === 'completed' || b.status === 'confirmed'
    db.update('bookings', b.id, {
      paid: isCompleted ? 1 : 0,
      amountPaid: isCompleted ? (Number(b.total) || 0) : 0,
      paidAt: isCompleted ? b.updated_at : null,
    })
  }
}
console.log(`Backfilled paid fields on ${allBookings.length} bookings.`)

console.log('Seed complete.')
