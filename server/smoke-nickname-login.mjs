// Localhost smoke test: nickname + mobile-number login.
import 'dotenv/config'
const B = 'http://localhost:5174/api'
const ts = Date.now()
let pass = 0, fail = 0

async function call(method, path, body, token) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${label}`) }
  else { fail++; console.log(`FAIL  ${label} — ${detail}`) }
}

// 1. signup with nickname + phone
const email = `test${ts}@ex.com`
const d8 = String(ts).slice(-8)
const phone = `010 ${d8.slice(0, 4)}-${d8.slice(4)}`
const phoneDigits = `010${d8}`
const createdIds = []
let r = await call('POST', '/auth/signup', {
  name: `Test User ${ts}`, nickname: `Testy${ts}`, email, phone,
  dob: '1995-04-04', password: 'password123', skillLevel: 'Intermediate',
})
check('signup with nickname+phone → 200', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
check('signup payload has nickname', r.data?.user?.nickname === `Testy${ts}`, JSON.stringify(r.data?.user))
check('phone stored normalized', r.data?.user?.phone === phoneDigits, r.data?.user?.phone)
const token = r.data?.accessToken
if (r.data?.user?.id) createdIds.push(r.data.user.id)

// 2. duplicate nickname (case-insensitive)
r = await call('POST', '/auth/signup', {
  name: `Other ${ts}`, nickname: `testy${ts}`, email: `o${ts}@ex.com`, password: 'password123',
})
check('duplicate nickname → 409', r.status === 409, `${r.status} ${JSON.stringify(r.data)}`)

// 3. duplicate phone in international format (+20 ...)
r = await call('POST', '/auth/signup', {
  name: `Other2 ${ts}`, email: `o2${ts}@ex.com`, phone: `+20 ${phoneDigits.slice(1)}`, password: 'password123',
})
check('duplicate phone (other format) → 409', r.status === 409, `${r.status} ${JSON.stringify(r.data)}`)

// 4. login with email
r = await call('POST', '/auth/login', { email, password: 'password123' })
check('login with email → 200', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
check('login payload has nickname', r.data?.user?.nickname === `Testy${ts}`, JSON.stringify(r.data?.user?.nickname))

// 5. login with phone (raw, spaced, +20, dashed)
for (const id of [phone, phoneDigits, `+20 ${phoneDigits.slice(1)}`, `010-${d8.slice(0, 4)}-${d8.slice(4)}`]) {
  r = await call('POST', '/auth/login', { email: id, password: 'password123' })
  check(`login with "${id}" → 200`, r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
}

// 6. wrong password via phone
r = await call('POST', '/auth/login', { email: phoneDigits, password: 'wrongpass1' })
check('wrong password via phone → 401', r.status === 401, `${r.status} ${JSON.stringify(r.data)}`)

// 7. /auth/me returns nickname
r = await call('GET', '/auth/me', null, token)
check('GET /auth/me has nickname', r.data?.user?.nickname === `Testy${ts}`, JSON.stringify(r.data?.user?.nickname))
check('GET /auth/me has phone', r.data?.user?.phone === phoneDigits, JSON.stringify(r.data?.user?.phone))

// 8. profile: set new nickname, clear it, conflicts
r = await call('PUT', '/auth/profile', { nickname: `Alias${ts}` }, token)
check('profile set nickname → 200', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
check('profile nickname saved', r.data?.nickname === `Alias${ts}`, r.data?.nickname)

r = await call('PUT', '/auth/profile', { nickname: 'ab' }, token)
check('profile short nickname → 400', r.status === 400, `${r.status} ${JSON.stringify(r.data)}`)

// 9. users search by nickname (needs admin token — login admin)
const adminEmail = process.env.ADMIN_EMAIL || 'admin@mmpadel.com'
const adminPass = process.env.ADMIN_PASSWORD
let adminToken = null
r = await call('POST', '/auth/login', { email: adminEmail, password: adminPass })
const adminOk = r.status === 200
if (adminOk) {
  adminToken = r.data.accessToken
  r = await call('GET', `/users?role=player&search=Alias${ts}&limit=10`, null, adminToken)
  const found = (r.data?.players || []).some(p => p.nickname === `Alias${ts}`)
  check('users search by nickname finds user', found, JSON.stringify(r.data?.players?.map(p => p.nickname)))

  // 10. admin edit: nickname conflict with existing user
  const otherId = (await call('GET', `/users?role=player&search=${email}&limit=5`, null, adminToken)).data?.players?.[0]?.id
  // create second user then try to steal first's nickname
  r = await call('POST', '/users', {
    full_name: `AdminCreated ${ts}`, email: `ac${ts}@ex.com`, role: 'player', nickname: `Stolen${ts}`,
  }, adminToken)
  check('admin create with nickname → 201', r.status === 201, `${r.status} ${JSON.stringify(r.data)}`)
  const newId = r.data?.id
  if (newId) {
    r = await call('PUT', `/users/${newId}`, { nickname: `Alias${ts}` }, adminToken)
    check('admin nickname conflict → 409', r.status === 409, `${r.status} ${JSON.stringify(r.data)}`)
    // unique-ok update
    r = await call('PUT', `/users/${newId}`, { nickname: `StolenB${ts}` }, adminToken)
    check('admin nickname change → 200', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
    await call('DELETE', `/users/${newId}`, null, adminToken)
  }
} else {
  check('admin login', false, `${r.status} ${JSON.stringify(r.data)} — set ADMIN_PASSWORD in env for admin checks`)
}

// 11. ambiguous phone → 409: force two accounts onto one phone directly in
// the DB (API blocks duplicates), assert login refuses, then restore.
try {
  const { getKnex } = await import('./src/sql.js')
  const knex = getKnex()
  const other = await call('POST', '/auth/signup', {
    name: `Amb ${ts}`, email: `amb${ts}@ex.com`, phone: `011${d8}`, password: 'password123',
  })
  const ambId = other.data?.user?.id
  if (ambId) {
    createdIds.push(ambId)
    const orig = await knex('users').where('user_id', ambId).first()
    await knex('users').where('user_id', ambId).update({ phone: phoneDigits })
    r = await call('POST', '/auth/login', { email: phoneDigits, password: 'password123' })
    check('ambiguous phone login → 409', r.status === 409, `${r.status} ${JSON.stringify(r.data)}`)
    await knex('users').where('user_id', ambId).update({ phone: orig.phone })
    // after restore, phone login works again
    r = await call('POST', '/auth/login', { email: `+20 ${phoneDigits.slice(1)}`, password: 'password123' })
    check('phone login after restore → 200', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`)
  } else {
    check('ambiguous phone setup (signup)', false, JSON.stringify(other.data))
  }
} catch (err) {
  check('ambiguous phone test', false, err.message)
}

// cleanup: remove users created by this run
if (adminOk) {
  for (const id of createdIds) await call('DELETE', `/users/${id}`, null, adminToken)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
