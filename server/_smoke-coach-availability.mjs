/**
 * Coach availability e2e smoke — run against a live backend on :5174.
 *   node server/_smoke-coach-availability.mjs
 *
 * Verifies (and cleans up after itself):
 *   1. GET /coach-availability shape
 *   2. COACH_CONFLICT on a booked future slot (coach unrestricted)
 *   3. PUT validation (end <= start → 400)
 *   4. Weekly windows: within → 200, outside hours → 409, other weekday → 409
 *   5. Day-off: add → 201, duplicate → 409, blocks slot → 409, remove → 200
 *   6. force=true override on POST and PUT
 *   7. State restored exactly (weekly + dates)
 */
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:5174/api'
const now = new Date()
const TODAY = now.toISOString().slice(0, 10)

const loadEnv = (file) => {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch (e) {
    return { status: 0, ok: false, data: { error: e.message } }
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, ok: res.ok, data }
}

let pass = 0
let fail = 0
const check = (cond, label) => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`)
}

const env = loadEnv(new URL('./.env', import.meta.url))
const password = env.ADMIN_PASSWORD
if (!password) { console.error('FATAL: ADMIN_PASSWORD not set in server/.env'); process.exit(1) }

const login = await api('POST', '/auth/login', { email: env.ADMIN_EMAIL || 'admin@mmpadel.com', password }, null)
if (!login.ok || !login.data?.accessToken) {
  console.error('FATAL: admin login failed:', login.status, JSON.stringify(login.data))
  process.exit(1)
}
const token = login.data.accessToken
console.log('Logged in as admin\n')

const createdSlotIds = []
const createdDateIds = []
let original = null
let coachId = null

try {
  // ── 1. shape ────────────────────────────────────────────────────────────
  const avail0 = await api('GET', '/coach-availability', null, token)
  check(avail0.ok && Array.isArray(avail0.data?.coaches), 'GET /coach-availability → { coaches: [...] }')
  const coaches = avail0.data?.coaches || []
  check(coaches.length > 0, `at least one coach user (${coaches.length} found)`)
  const coach = coaches.find(c => /laila/i.test(c.name || '')) || coaches[0]
  coachId = coach?.id
  check(Boolean(coach) && Array.isArray(coach.weekly) && Array.isArray(coach.dates),
    `coach "${coach?.name}" (id ${coachId}) has weekly + dates arrays`)
  original = { weekly: coach.weekly, dates: coach.dates }
  console.log(`  original: ${original.weekly.length} weekly row(s), ${original.dates.length} day-off(s)\n`)

  // ── pick two future dates with zero slots ───────────────────────────────
  const slotsRes = await api('GET', '/slots', null, token)
  const slots = Array.isArray(slotsRes.data) ? slotsRes.data : (slotsRes.data?.slots || [])
  check(slots.length > 0, `GET /slots → ${slots.length} slots`)
  const busyDates = new Set(slots.map(s => String(s.date).slice(0, 10)))
  const freeDates = []
  for (let i = 7; i <= 30 && freeDates.length < 2; i++) {
    const d = new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10)
    if (!busyDates.has(d) && d !== freeDates[0]) freeDates.push(d)
  }
  const [D, D2] = freeDates
  const weekdayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay()
  check(Boolean(D && D2), `test dates chosen: ${D}, ${D2} (no existing slots)`)

  // ── 2. COACH_CONFLICT while unrestricted (temporarily clear weekly;
  //       finally{} restores the original rows) ────────────────────────────
  if (original.weekly.length > 0) {
    const clr = await api('PUT', `/coach-availability/${coachId}`, { weekly: [] }, token)
    check(clr.ok, 'temporarily cleared existing weekly rows for conflict test')
  }
  const norm = (s) => ({ date: String(s.date).slice(0, 10), time: String(s.time), court: Number(s.court) })
  const taken = (date, time, court) => slots.some(s => { const n = norm(s); return n.date === date && n.time === time && n.court === court })
  const src = slots.find(s => s.coach_id && (s.player_text || '').trim() &&
    [1, 2, 3].some(c => c !== norm(s).court && !taken(norm(s).date, norm(s).time, c)))
  if (src) {
    const otherCourt = [1, 2, 3].find(c => c !== norm(src).court && !taken(norm(src).date, norm(src).time, c))
    const conflict = await api('POST', '/slots', {
      date: norm(src).date, time: norm(src).time, court: otherCourt, coach_id: src.coach_id,
    }, token)
    check(conflict.status === 409 && conflict.data?.code === 'COACH_CONFLICT',
      `overlap with booked slot ${src.id} (${norm(src).date} ${norm(src).time} coach #${src.coach_id}) → 409 COACH_CONFLICT`)
  } else {
    check(false, 'COACH_CONFLICT: no booked coach slot with a free court at the same time found in /slots')
  }

  // ── 3. PUT validation ───────────────────────────────────────────────────
  const bad = await api('PUT', `/coach-availability/${coachId}`, {
    weekly: [{ weekday: weekdayOf(D), start_time: '20:00', end_time: '19:00' }],
  }, token)
  check(bad.status === 400 && /after/.test(bad.data?.error || ''), `PUT end<=start → 400 (${bad.data?.error})`)

  // ── 4. weekly windows ───────────────────────────────────────────────────
  const wd = weekdayOf(D)
  const put = await api('PUT', `/coach-availability/${coachId}`, {
    weekly: [{ weekday: wd, start_time: '15:00', end_time: '17:00' }],
  }, token)
  check(put.ok && put.data?.weekly?.length === 1 && put.data.weekly[0].start_time === '15:00',
    `PUT weekly [{weekday ${wd}, 15:00–17:00}] → 200, echoed`)

  const inWindow = await api('POST', '/slots', { date: D, time: '16:00', court: 1, coach_id: coachId }, token)
  check(inWindow.ok, `POST ${D} 16:00 (inside window) → 200 id=${inWindow.data?.id}`)
  if (inWindow.data?.id) createdSlotIds.push(inWindow.data.id)

  const outside = await api('POST', '/slots', { date: D, time: '18:00', court: 1, coach_id: coachId }, token)
  check(outside.status === 409 && outside.data?.code === 'COACH_UNAVAILABLE' && outside.data?.details?.reason === 'outside_hours',
    `POST ${D} 18:00 (outside window) → 409 COACH_UNAVAILABLE/outside_hours`)

  const otherDay = await api('POST', '/slots', { date: D2, time: '16:00', court: 1, coach_id: coachId }, token)
  check(otherDay.status === 409 && otherDay.data?.code === 'COACH_UNAVAILABLE' && otherDay.data?.details?.reason === 'not_working_day',
    `POST ${D2} (weekday not in weekly set) → 409 COACH_UNAVAILABLE/not_working_day`)

  // ── 5. day-off ──────────────────────────────────────────────────────────
  const addOff = await api('POST', `/coach-availability/${coachId}/dates`, { date: D, note: 'smoke' }, token)
  check(addOff.status === 201 && addOff.data?.id, `POST dates ${D} → 201 id=${addOff.data?.id}`)
  if (addOff.data?.id) createdDateIds.push(addOff.data.id)

  const dupOff = await api('POST', `/coach-availability/${coachId}/dates`, { date: D }, token)
  check(dupOff.status === 409, `duplicate day-off ${D} → 409`)

  const dayOffSlot = await api('POST', '/slots', { date: D, time: '16:00', court: 2, coach_id: coachId }, token)
  check(dayOffSlot.status === 409 && dayOffSlot.data?.code === 'COACH_UNAVAILABLE' && dayOffSlot.data?.details?.reason === 'day_off',
    `POST ${D} 16:00 (day off, inside window) → 409 COACH_UNAVAILABLE/day_off`)

  const delOff = await api('DELETE', `/coach-availability/dates/${addOff.data.id}`, null, token)
  check(delOff.ok, 'DELETE day-off → 200')
  createdDateIds.splice(createdDateIds.indexOf(addOff.data.id), 1)

  // ── 6. force override ───────────────────────────────────────────────────
  const forcePost = await api('POST', '/slots', { date: D, time: '18:00', court: 1, coach_id: coachId, force: true }, token)
  check(forcePost.ok, `POST ${D} 18:00 force:true → 200 id=${forcePost.data?.id}`)
  if (forcePost.data?.id) createdSlotIds.push(forcePost.data.id)

  const target = inWindow.data?.id
  if (target) {
    const putBlocked = await api('PUT', `/slots/${target}`, { time: '19:00' }, token)
    check(putBlocked.status === 409 && putBlocked.data?.code === 'COACH_UNAVAILABLE',
      `PUT slot ${target} → 19:00 (moved outside window) → 409 COACH_UNAVAILABLE`)
    const putForce = await api('PUT', `/slots/${target}`, { time: '19:00', force: true }, token)
    check(putForce.ok, `PUT slot ${target} → 19:00 force:true → 200`)
  }
} finally {
  // ── 7. cleanup + restore ────────────────────────────────────────────────
  for (const id of createdSlotIds) {
    const r = await api('DELETE', `/slots/${id}`, null, token)
    console.log(`cleanup: DELETE /slots/${id} → ${r.status}`)
  }
  for (const id of createdDateIds) {
    const r = await api('DELETE', `/coach-availability/dates/${id}`, null, token)
    console.log(`cleanup: DELETE /coach-availability/dates/${id} → ${r.status}`)
  }
  if (coachId && original) {
    const r = await api('PUT', `/coach-availability/${coachId}`, { weekly: original.weekly }, token)
    console.log(`cleanup: restored ${original.weekly.length} weekly row(s) → ${r.status}`)
    const after = await api('GET', '/coach-availability', null, token)
    const c = (after.data?.coaches || []).find(x => x.id === coachId)
    const weeklyOk = (c?.weekly?.length || 0) === original.weekly.length
    const datesOk = (c?.dates?.length || 0) === original.dates.length
    check(weeklyOk && datesOk, `state restored (weekly ${c?.weekly?.length}/${original.weekly.length}, dates ${c?.dates?.length}/${original.dates.length})`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
console.log(fail ? 'SMOKE FAILED' : 'ALL PASSED')
process.exit(fail ? 1 : 0)
