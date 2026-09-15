import db from './database.js'

const PLAYER_MAP = {
  'farida fathala': 'Farida Fathallah',
  'titos': 'Totos',
}

function resolveName(raw) {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  return PLAYER_MAP[lower] || trimmed
}

function parseNames(text) {
  return text.split(/\s*\/\s*|\s*\+\s*/).map(n => resolveName(n)).join(' / ')
}

const date = '2026-09-10'

const existing = db.findAll('slots', s => s.date === date)
for (const s of existing) { db.remove('slots', s.id) }

const schedule = [
  ['16:00', 1, 'Hassan Medhat'],
  ['17:00', 1, 'Omar Ismail'],
  ['18:00', 1, 'Farida Fathala'],
  ['19:00', 1, 'Ashraf'],
  ['20:00', 1, 'Titos'],
]

let created = 0
for (const [time, court, playerText] of schedule) {
  const resolved = parseNames(playerText)
  const players = resolved.split(/\s*\/\s*/).map(n => n.trim()).filter(Boolean)
  const sessionType = players.length > 1 ? 'group' : 'private'
  db.insert('slots', { date, time, court, player_text: resolved, session_type: sessionType, booking_id: null })
  created++
}

console.log(`Imported ${created} slots for ${date}.`)
