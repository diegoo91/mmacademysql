import db from './database.js'

// Clear ALL existing slots
const allSlots = db.findAll('slots')
for (const s of allSlots) {
  db.remove('slots', s.id)
}
console.log(`Cleared ${allSlots.length} old slots.`)

// Today: Sunday 13 Sep 2026
const today = '2026-09-13'

const schedule = [
  [today, '18:00', 1, 'Hassan Medhat'],
  [today, '18:00', 2, 'Ahmed Saleh'],
  [today, '19:00', 1, 'Hassan Medhat'],
  [today, '19:00', 2, 'Farida Fathallah'],
  [today, '20:00', 1, 'Aley / Ismail'],
  [today, '20:00', 2, 'Yasin Fathallah'],
  [today, '21:00', 1, 'Eyad Dawish / Youssef Dawish'],
  [today, '21:00', 2, 'Totos'],
  [today, '22:00', 1, 'Halawany / Zein Halawany'],
  [today, '22:00', 2, 'Ashraf'],
]

let created = 0
for (const [date, time, court, playerText] of schedule) {
  db.insert('slots', { date, time, court, player_text: playerText, booking_id: null })
  created++
}

console.log(`Imported ${created} slots for ${today}.`)
