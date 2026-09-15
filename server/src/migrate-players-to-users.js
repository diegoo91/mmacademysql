import db from './database.js'

const players = db.findAll('players')
const users = db.findAll('users')
let migrated = 0

for (const p of players) {
  const email = (p.email || '').toLowerCase()
  const existingUser = email ? users.find(u => u.email === email) : null
  if (existingUser) {
    db.update('users', existingUser.id, {
      notes: p.notes || existingUser.notes || '',
      skill_level: p.skill_level || existingUser.skill_level,
      dob: p.dob || existingUser.dob,
      phone: p.phone || existingUser.phone,
    })
  } else {
    db.insert('users', {
      name: p.full_name, email: p.email, phone: p.phone || '', dob: p.dob || '',
      role: 'player', password_hash: null, is_claimed: false,
      skill_level: p.skill_level || 'Intermediate', notes: p.notes || '',
      private_balance: 0, group_balance: 0,
      member_since: new Date().getFullYear().toString(), force_password_change: 1,
    })
  }
  migrated++
}

console.log(`Migrated ${migrated} players to users.`)
console.log('After verifying, you can remove the players collection from academy.db.json.')
