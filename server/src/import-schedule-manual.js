import db from './database.js'

const PLAYER_MAP = {
  'zein kowar': 'Zain',
  'yasin fathala': 'Yasin Fathallah',
  'yassin fathalla': 'Yasin Fathallah',
  'yasin fathallah': 'Yasin Fathallah',
  'farida fathala': 'Farida Fathallah',
  'farida fathalla': 'Farida Fathallah',
  'farida fathalaa': 'Farida Fathallah',
  'farida fathalaah': 'Farida Fathallah',
  'ammar abdelghany': 'Ammar Abd El Ghany',
  'titos': 'Totos',
  'totos': 'Totos',
  'yassin mahmoud': 'Yasin Mahmoud',
  'eyad darwish': 'Eyad Dawish',
  'eyad dawish': 'Eyad Dawish',
  'youssef darwish': 'Youssef Dawish',
  'youssef dawish': 'Youssef Dawish',
}

function resolveName(raw) {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  return PLAYER_MAP[lower] || trimmed
}

function parseNames(text) {
  return text.split(/\s*\/\s*|\s*\+\s*/).map(n => resolveName(n)).join(' / ')
}

function generateEmail(name) {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)
  return parts.join('.') + '@mmpadel.com'
}

function ensurePlayer(name) {
  const email = generateEmail(name)
  const existing = db.find('users', u => u.email === email)
  if (existing) return
  db.insert('users', {
    name, email, phone: '', dob: '',
    role: 'player', password_hash: null, is_claimed: false,
    skill_level: 'Intermediate', position: '', notes: '',
    private_balance: 0, group_balance: 0,
    member_since: new Date().getFullYear().toString(), force_password_change: 1,
  })
  console.log(`  Created player: ${name}`)
}

// Clear existing slots for the dates we're importing
const datesToImport = [
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'
]

for (const date of datesToImport) {
  const existing = db.findAll('slots', s => s.date === date)
  for (const s of existing) {
    db.remove('slots', s.id)
  }
}
console.log(`Cleared slots for ${datesToImport.length} dates.`)

// Schedule data: [date, time, court, playerText]
const schedule = [
  // Monday, 31 Aug
  ['2026-08-31', '16:00', 1, 'Alaa'],
  ['2026-08-31', '17:00', 1, 'Ismail / Aley'],
  ['2026-08-31', '18:00', 1, 'Yasin Mahmoud / Omar Ismail'],
  ['2026-08-31', '19:00', 1, 'Zain'],
  ['2026-08-31', '20:00', 1, 'Hashad'],
  ['2026-08-31', '21:00', 1, 'Yasin Fathallah'],
  ['2026-08-31', '22:00', 1, 'Magdy'],
  ['2026-08-31', '23:00', 1, 'Ammar Abd El Ghany / Adham'],

  // Tuesday, 1 Sep
  ['2026-09-01', '15:00', 1, 'Zain'],
  ['2026-09-01', '16:00', 1, 'Ahmed Saleh / Ismail'],
  ['2026-09-01', '17:00', 1, 'Totos'],
  ['2026-09-01', '18:00', 1, 'Omar Hisham / Hashad'],
  ['2026-09-01', '19:00', 1, 'Malak Nazif'],
  ['2026-09-01', '20:00', 1, 'Farida Fathallah / Alaa'],

  // Wednesday, 2 Sep
  ['2026-09-02', '15:00', 1, 'Ismail / Aley'],
  ['2026-09-02', '16:00', 1, 'Hassan Medhat / Omar Ismail'],
  ['2026-09-02', '17:00', 1, 'Yasin Mahmoud / Sharaf'],
  ['2026-09-02', '18:00', 1, 'Halawany / Zein Halawany'],
  ['2026-09-02', '19:00', 1, 'Ammar Abd El Ghany / Adham'],
  ['2026-09-02', '20:00', 1, 'Farida Fathallah'],
  ['2026-09-02', '21:00', 1, 'Eyad Dawish / Youssef Dawish'],
  ['2026-09-02', '22:00', 1, 'Yasin Fathallah / Totos'],
  ['2026-09-02', '23:00', 1, 'Magdy'],

  // Thursday, 3 Sep
  ['2026-09-03', '14:00', 1, 'Farida Fathallah'],
  ['2026-09-03', '15:00', 1, 'Hassan Medhat'],
  ['2026-09-03', '16:00', 1, 'Totos / Magdy'],
  ['2026-09-03', '17:00', 1, 'Yasin Mahmoud / Sharaf / Alaa'],
  ['2026-09-03', '18:00', 1, 'Ahmed Saleh'],
  ['2026-09-03', '19:00', 1, 'Aley / Ismail'],

  // Sunday, 6 Sep (dual court)
  ['2026-09-06', '16:00', 1, 'Farida Fathallah / Hassan Medhat'],
  ['2026-09-06', '16:00', 2, 'Available'],
  ['2026-09-06', '17:00', 1, 'Ahmed Saleh / Zain'],
  ['2026-09-06', '17:00', 2, 'Available'],
  ['2026-09-06', '18:00', 1, 'Aley / Ismail'],
  ['2026-09-06', '18:00', 2, 'Available'],
  ['2026-09-06', '19:00', 1, 'Yasin Mahmoud'],
  ['2026-09-06', '19:00', 2, 'Available'],
  ['2026-09-06', '20:00', 1, 'Magdy'],
  ['2026-09-06', '20:00', 2, 'Yasin Fathallah'],
  ['2026-09-06', '21:00', 1, 'Eyad Dawish / Youssef Dawish'],
  ['2026-09-06', '21:00', 2, 'Dima'],
  ['2026-09-06', '22:00', 1, 'Hashad'],
  ['2026-09-06', '22:00', 2, 'Ashraf'],
  ['2026-09-06', '23:00', 1, 'Totos'],
  ['2026-09-06', '23:00', 2, 'Available'],

  // Monday, 7 Sep (dual court)
  ['2026-09-07', '16:00', 1, 'Zain'],
  ['2026-09-07', '16:00', 2, 'Hassan Medhat'],
  ['2026-09-07', '17:00', 1, 'Omar Ismail / Aley'],
  ['2026-09-07', '17:00', 2, 'Hassan Medhat'],
  ['2026-09-07', '18:00', 1, 'Sharaf'],
  ['2026-09-07', '18:00', 2, 'Magdy'],
  ['2026-09-07', '19:00', 1, 'Hamoksha / Selim'],
  ['2026-09-07', '19:00', 2, 'Haitham'],
  ['2026-09-07', '20:00', 1, 'Ammar Abd El Ghany / Adham'],
  ['2026-09-07', '20:00', 2, 'Halawany'],
  ['2026-09-07', '21:00', 1, 'Yasin Fathallah'],
  ['2026-09-07', '21:00', 2, 'Available'],
  ['2026-09-07', '22:00', 1, 'Totos'],
  ['2026-09-07', '22:00', 2, 'Farida Fathallah'],

  // Tuesday, 8 Sep (dual court)
  ['2026-09-08', '15:00', 1, 'Zain'],
  ['2026-09-08', '15:00', 2, 'Totos'],
  ['2026-09-08', '16:00', 1, 'Aley / Ismail'],
  ['2026-09-08', '16:00', 2, 'Farida Fathallah'],
  ['2026-09-08', '17:00', 1, 'Ahmed Saleh'],
  ['2026-09-08', '17:00', 2, 'Hassan Medhat'],
  ['2026-09-08', '18:00', 1, 'Sharaf'],
  ['2026-09-08', '18:00', 2, 'Ashraf'],
  ['2026-09-08', '19:00', 1, 'Hashad'],
  ['2026-09-08', '19:00', 2, 'Kenzy'],
  ['2026-09-08', '20:00', 1, 'Magdy'],
  ['2026-09-08', '20:00', 2, 'Totos'],

  // Wednesday, 9 Sep (3 courts!)
  ['2026-09-09', '16:00', 1, 'Zain'],
  ['2026-09-09', '16:00', 2, 'Hassan Medhat'],
  ['2026-09-09', '16:00', 3, 'Available'],
  ['2026-09-09', '17:00', 1, 'Farida Fathallah'],
  ['2026-09-09', '17:00', 2, 'Ahmed Saleh'],
  ['2026-09-09', '17:00', 3, 'Available'],
  ['2026-09-09', '18:00', 1, 'Kenzy'],
  ['2026-09-09', '18:00', 2, 'Magdy'],
  ['2026-09-09', '18:00', 3, 'Omar Ismail / Ismail'],
  ['2026-09-09', '19:00', 1, 'Hamoksha'],
  ['2026-09-09', '19:00', 2, 'Haitham'],
  ['2026-09-09', '19:00', 3, 'Available'],
  ['2026-09-09', '20:00', 1, 'Ammar Abd El Ghany / Adham'],
  ['2026-09-09', '20:00', 2, 'Ashraf'],
  ['2026-09-09', '20:00', 3, 'Available'],
  ['2026-09-09', '21:00', 1, 'Eyad Dawish / Youssef Dawish'],
  ['2026-09-09', '21:00', 2, 'Halawany'],
  ['2026-09-09', '21:00', 3, 'Available'],

  // Thursday, 10 Sep
  ['2026-09-10', '16:00', 1, 'Hassan Medhat'],
  ['2026-09-10', '17:00', 1, 'Omar Ismail'],
  ['2026-09-10', '18:00', 1, 'Farida Fathallah'],
  ['2026-09-10', '19:00', 1, 'Ashraf'],
  ['2026-09-10', '20:00', 1, 'Totos'],
]

// Collect all unique player names
const allNames = new Set()
for (const [, , , playerText] of schedule) {
  if (playerText && playerText !== 'Available') {
    parseNames(playerText).split(' / ').forEach(n => allNames.add(n))
  }
}

console.log(`\nEnsuring ${allNames.size} players exist...`)
for (const name of allNames) {
  ensurePlayer(name)
}

// Insert slots
let slotsCreated = 0
for (const [date, time, court, playerText] of schedule) {
  const resolved = playerText === 'Available' ? '' : parseNames(playerText)
  db.insert('slots', {
    date, time, court,
    player_text: resolved,
    booking_id: null,
  })
  slotsCreated++
}

console.log(`\nImported ${slotsCreated} slots across ${datesToImport.length} dates.`)
console.log('Done.')
