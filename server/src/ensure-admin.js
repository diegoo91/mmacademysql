// Boot-time admin ensure: creates or updates the admin account from env vars.
// This is NON-DESTRUCTIVE — it only touches the admin user, never wipes slots/data.
// Used on Railway so a login is always available after a fresh deploy.

import bcrypt from 'bcryptjs'
import db from './db/index.js'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mmpadel.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin'

export async function ensureAdmin() {
  if (!ADMIN_PASSWORD) {
    console.log('ensure-admin: skipped (ADMIN_PASSWORD not set)')
    return
  }

  const maybe = db.find('users', u => u.email === ADMIN_EMAIL)
  const existing = maybe && typeof maybe.then === 'function' ? await maybe : maybe
  if (existing) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12)
    const eid = existing.user_id ?? existing.id
    await db.update('users', eid, { password_hash: hash, role: 'superadmin', name: ADMIN_NAME })
    console.log(`ensure-admin: updated ${ADMIN_EMAIL} (user_id=${eid})`)
  } else {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12)
    const created = await db.insert('users', {
      name: ADMIN_NAME, email: ADMIN_EMAIL, phone: '', dob: '',
      password_hash: hash, role: 'superadmin', skill_level: 'Intermediate',
      member_since: new Date().getFullYear().toString(),
      force_password_change: 0,
      notes: '', private_balance: 0, group_balance: 0, is_claimed: true,
      member_code: '001',
    })
    console.log(`ensure-admin: created ${ADMIN_EMAIL} (user_id=${created?.user_id ?? created?.id})`)
  }
}
