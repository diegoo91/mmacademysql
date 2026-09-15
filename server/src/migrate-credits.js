import db from './database.js'

const bookings = db.findAll('bookings')
let updated = 0
for (const b of bookings) {
  const needsBackfill = b.private_remaining === undefined || b.group_remaining === undefined
  if (needsBackfill) {
    const sessions = (() => { try { return JSON.parse(b.sessions_json || '[]') } catch { return [] } })()
    const priv = b.session_type === 'private' ? sessions.length : 0
    const grp = b.session_type === 'group' ? sessions.length : 0
    db.update('bookings', b.id, { private_remaining: priv, group_remaining: grp })
    updated++
  }
}
console.log(`Backfilled ${updated} bookings with credit fields.`)
