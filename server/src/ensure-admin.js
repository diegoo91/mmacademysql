// Boot-time admin ensure: creates the admin account if it doesn't exist.
// This is CREATE-ONLY — it never overwrites password/role on existing accounts.
// Used on hosted deploys so a login is always available after a fresh deploy.

import bcrypt from 'bcryptjs'
import db from './db.js'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@mmpadel.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin'

export async function ensureAdmin() {
  if (!ADMIN_PASSWORD) {
    console.log('ensure-admin: skipped (ADMIN_PASSWORD not set)')
    return
  }

  const existing = await db.find('users', u => u.email === ADMIN_EMAIL)
  if (existing) {
    console.log(`ensure-admin: ${ADMIN_EMAIL} already exists (id=${existing.id}) — no changes`)
    return
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const user = await db.insert('users', {
    name: ADMIN_NAME, email: ADMIN_EMAIL, phone: '', dob: '',
    password_hash: hash, role: 'superadmin', skill_level: 'Intermediate',
    member_since: new Date().getFullYear().toString(),
    force_password_change: 0,
    notes: '', private_balance: 0, group_balance: 0, is_claimed: true,
    member_code: '001',
  })
  console.log(`ensure-admin: created ${ADMIN_EMAIL} (id=${user.id}) [${db.backend}]`)
}
