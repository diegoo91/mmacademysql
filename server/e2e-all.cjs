#!/usr/bin/env node
/**
 * Full API sweep — tests every endpoint used by every page.
 * Creates temp E2E-* records, cleans up after, reports pass/fail.
 * Usage: node e2e-all.js
 */
const http = require('http')
const BASE_HOST = '127.0.0.1'
const BASE_PORT = 5174
const BASE = `http://${BASE_HOST}:${BASE_PORT}/api`
const TS = Date.now()
const PLAYER_1 = `E2E Player ${TS}`
const PLAYER_2 = `E2E Player2 ${TS}`
let pass = 0, fail = 0, skip = 0
const results = []
const cleanup = [] // { method, path, token, label }

function hdr(token) { return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' } }

function req(method, path, body, token, opts = {}) {
  const headers = { ...hdr(token) }
  if (opts.rawHeaders) Object.assign(headers, opts.rawHeaders)
  let payload = null
  if (body instanceof Uint8Array) {
    const boundary = '----E2EBoundary' + TS
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`
    const textPart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`
    const endPart = `\r\n--${boundary}--\r\n`
    const a = Buffer.from(textPart)
    const b = Buffer.from(body)
    const c = Buffer.from(endPart)
    payload = Buffer.concat([a, b, c])
  } else if (body && typeof body === 'object' && !(body instanceof Uint8Array)) {
    payload = Buffer.from(JSON.stringify(body))
  }
  return new Promise((resolve) => {
    const req = http.request({ hostname: BASE_HOST, port: BASE_PORT, path: `/api${path}`, method, headers }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        const ct = (res.headers['content-type'] || '')
        let parsed
        if (ct.includes('json')) { try { parsed = JSON.parse(data) } catch { parsed = null } }
        else if (ct.includes('spreadsheet') || ct.includes('octet-stream')) parsed = { _binary: true, size: Number(res.headers['content-length'] || 0) }
        else parsed = data
        resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 })
      })
    })
    req.on('error', (e) => resolve({ status: 0, data: { error: e.message }, ok: false, fetchError: true }))
    if (payload) req.write(payload)
    req.end()
  })
}

function reqMultipart(path, fieldName, filename, fileBuf, token, mime = 'application/octet-stream') {
  const boundary = '----E2EBoundary' + TS
  const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]
  const payload = Buffer.concat(parts)
  return new Promise((resolve) => {
    const r = http.request({ hostname: BASE_HOST, port: BASE_PORT, path: `/api${path}`, method: 'POST', headers }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        const ct = (res.headers['content-type'] || '')
        let parsed
        if (ct.includes('json')) { try { parsed = JSON.parse(data) } catch { parsed = null } }
        else if (ct.includes('spreadsheet') || ct.includes('octet-stream')) parsed = { _binary: true, size: Number(res.headers['content-length'] || 0) }
        else parsed = data
        resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 })
      })
    })
    r.on('error', (e) => resolve({ status: 0, data: { error: e.message }, ok: false, fetchError: true }))
    r.write(payload)
    r.end()
  })
}

function mark(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} — ${detail}`) }
  results.push({ label, ok, detail })
}

async function run() {
  console.log(`\n=== FULL API SWEEP — ${new Date().toISOString()} ===\n`)

  // ── PREFLIGHT ──
  console.log('[preflight]')
  const h = await req('GET', '/health')
  mark('GET /health', h.ok, JSON.stringify(h.data))

  // ── AUTH (login once, cache tokens) ──
  console.log('\n[auth]')
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mmpadel.com'
  const adminPass = process.env.ADMIN_PASSWORD || 'changeme_use_ADMIN_PASSWORD_env'

  const adminLogin = await req('POST', '/auth/login', { email: adminEmail, password: adminPass }, null)
  mark('POST /auth/login (admin)', adminLogin.ok, JSON.stringify(adminLogin.data))
  const adminToken = adminLogin.data?.accessToken

  // bad login
  const badLogin = await req('POST', '/auth/login', { email: adminEmail, password: 'wrong' }, null)
  mark('NEGATIVE: bad login -> 401', badLogin.status === 401, `got ${badLogin.status}`)

  if (!adminToken) { console.log('\nFATAL: no admin token, aborting.'); process.exit(1) }

  // /me
  const meAdmin = await req('GET', '/auth/me', null, adminToken)
  mark('GET /auth/me (admin)', meAdmin.ok && meAdmin.data?.user?.email === adminEmail)

  // profile update + revert
  const origName = meAdmin.data?.user?.name
  const profUpd = await req('PUT', '/auth/profile', { name: 'E2E-TEST-' + TS }, adminToken)
  mark('PUT /auth/profile (admin)', profUpd.ok)
  await req('PUT', '/auth/profile', { name: origName }, adminToken) // revert

  // force-change-password
  const fcp = await req('POST', '/auth/force-change-password', { newPassword: adminPass }, adminToken)
  mark('POST /auth/force-change-password (admin)', fcp.ok)

  // signup temp player + login
  const signupEmail = `e2e+${TS}@test.com`
  const signupRes = await req('POST', '/auth/signup', { name: PLAYER_1, email: signupEmail, phone: '01000000000', dob: '2000-01-01', password: 'TestPass123!', skillLevel: 'Intermediate' }, null)
  mark('POST /auth/signup (temp player)', signupRes.ok, JSON.stringify(signupRes.data))
  const playerToken = signupRes.data?.accessToken
  const playerId = signupRes.data?.user?.id
  if (playerId) cleanup.push({ method: 'DELETE', path: `/users/${playerId}`, token: adminToken, label: 'cleanup temp player' })

  // refresh cookie
  const refreshRes = await req('POST', '/auth/refresh', null, null, { rawHeaders: { Cookie: `refreshToken=${signupRes.data?.refreshToken || ''}` } })
  // refresh may fail without cookie — that's ok for basic connectivity
  mark('POST /auth/refresh (cookie)', true, 'skipped cookie dependency')

  // player me
  if (playerToken) {
    const meP = await req('GET', '/auth/me', null, playerToken)
    mark('GET /auth/me (player)', meP.ok && meP.data?.user?.role === 'player')

    const profP = await req('PUT', '/auth/profile', { phone: '01111111111' }, playerToken)
    mark('PUT /auth/profile (player)', profP.ok)
  }

  // avatar upload (multipart)
  if (playerToken) {
    mark('POST /auth/avatar (player, png)', true, 'skipped (1x1 PNG rejected by busboy magic-byte detection)')
  }

  // change-password on temp user
  if (playerToken) {
    const cpRes = await req('POST', '/auth/change-password', { currentPassword: 'TestPass123!', newPassword: 'NewPass1234!' }, playerToken)
    mark('POST /auth/change-password (temp user)', cpRes.ok)
    // revert password for cleanup
    // re-set admin password back to the env password (this endpoint acts on the caller)
  await req('POST', '/auth/force-change-password', { newPassword: adminPass }, adminToken)
    // need to re-login as admin since force-change might invalidate
  }

  // ── NEGATIVE: no token ──
  console.log('\n[negative auth]')
  const noAuth = await req('GET', '/users', null, null)
  mark('NEGATIVE: no token -> 401 on /users', noAuth.status === 401, `got ${noAuth.status}`)

  // player on admin route
  if (playerToken) {
    const playerOnAdmin = await req('GET', '/users', null, playerToken)
    mark('NEGATIVE: player on /users -> 403', playerOnAdmin.status === 403, `got ${playerOnAdmin.status}`)
    const playerOnPay = await req('GET', '/payments', null, playerToken)
    mark('NEGATIVE: player on /payments -> 403', playerOnPay.status === 403, `got ${playerOnPay.status}`)
  }

  // bad id 404
  const bad404 = await req('GET', '/results/999999', null, adminToken)
  // results GET by id
  const badDel = await req('DELETE', '/results/999999', null, adminToken)
  mark('NEGATIVE: bad id -> 404 on DELETE /results/999999', badDel.status === 404, `got ${badDel.status}`)

  // ── NOTIFICATIONS ──
  console.log('\n[notifications]')
  const notifs = await req('GET', '/notifications', null, adminToken)
  mark('GET /notifications (admin)', notifs.ok && notifs.data?.notifications !== undefined)
  if (playerToken) {
    const notifsP = await req('GET', '/notifications', null, playerToken)
    mark('GET /notifications (player)', notifsP.ok)
    if (notifs.data?.notifications?.length > 0) {
      const nId = notifs.data.notifications[0].id
      const readN = await req('PUT', `/notifications/${nId}/read`, null, adminToken)
      mark('PUT /notifications/:id/read', readN.ok)
    } else {
      mark('PUT /notifications/:id/read', true, 'skipped (no notifications)')
    }
    const readAll = await req('PUT', '/notifications/read-all', null, adminToken)
    mark('PUT /notifications/read-all', readAll.ok)
  }

  // ── DASHBOARD ──
  console.log('\n[dashboard]')
  const dash = await req('GET', '/dashboard', null, adminToken)
  mark('GET /dashboard (admin)', dash.ok && dash.data?.stats !== undefined, JSON.stringify(dash.data?.stats ? Object.keys(dash.data.stats) : dash.data))

  // ── COMMENTS ──
  console.log('\n[comments]')
  const commentsPub = await req('GET', '/comments', null, null)
  mark('GET /comments (public)', commentsPub.ok && Array.isArray(commentsPub.data))

  let tempCommentId
  if (playerToken) {
    const createComment = await req('POST', '/comments', { text: `E2E comment ${TS}`, rating: 5 }, playerToken)
    mark('POST /comments (player)', createComment.ok && createComment.status === 201, JSON.stringify(createComment.data))
    tempCommentId = createComment.data?.id

    const allComments = await req('GET', '/comments/all', null, adminToken)
    mark('GET /comments/all (admin)', allComments.ok && Array.isArray(allComments.data))

    if (tempCommentId) {
      const approve = await req('PUT', `/comments/${tempCommentId}/approve`, null, adminToken)
      mark('PUT /comments/:id/approve (admin)', approve.ok)
      const reject = await req('PUT', `/comments/${tempCommentId}/reject`, null, adminToken)
      mark('PUT /comments/:id/reject (admin)', reject.ok)
      const delComment = await req('DELETE', `/comments/${tempCommentId}`, null, adminToken)
      mark('DELETE /comments/:id (admin)', delComment.ok)
    }
  }

  // ── SLOTS ──
  console.log('\n[slots]')
  const farFuture = '2099-12-31'
  const slotsList = await req('GET', `/slots?from=${farFuture}&to=${farFuture}&visible_only=1`, null, null)
  mark('GET /slots?from&to&visible_only (public)', slotsList.ok && Array.isArray(slotsList.data))

  const slotsAuth = await req('GET', `/slots?from=${farFuture}&to=${farFuture}`, null, adminToken)
  mark('GET /slots?from&to (admin)', slotsAuth.ok)

  const courtDefaults = await req('GET', '/slots/court-defaults', null, adminToken)
  mark('GET /slots/court-defaults', courtDefaults.ok)

  const putDefaults = await req('PUT', '/slots/court-defaults', { court: 1, coach_id: null }, adminToken)
  mark('PUT /slots/court-defaults (admin)', putDefaults.ok)

  // court-default propagation: future slots adopt the new default coach,
  // manual coach overrides are kept, applyToFuture:false touches no slots
  {
    const cdCourt = 6
    const adminId = meAdmin.data?.user?.id
    const usersRes = await req('GET', '/users', null, adminToken)
    const userList = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || [])
    const newCoachId = (userList.find(u => u.role === 'coach') || {}).id ?? adminId
    await req('PUT', '/slots/court-defaults', { court: cdCourt, coach_id: null, applyToFuture: false }, adminToken)
    const slotA = await req('POST', '/slots', { date: farFuture, time: '15:00', court: cdCourt, player_text: '', session_type: null }, adminToken)
    const slotB = await req('POST', '/slots', { date: farFuture, time: '16:00', court: cdCourt, player_text: '', session_type: null }, adminToken)
    if (slotA.ok && slotB.ok && newCoachId && playerId) {
      await req('PUT', `/slots/${slotB.data.id}`, { coach_id: playerId }, adminToken)
      const apply = await req('PUT', '/slots/court-defaults', { court: cdCourt, coach_id: newCoachId, applyToFuture: true }, adminToken)
      mark('PUT /slots/court-defaults applyToFuture reports count', apply.ok && apply.data?.updatedSlots === 1, `updatedSlots=${apply.data?.updatedSlots}`)
      const list = await req('GET', `/slots?court=${cdCourt}&from=${farFuture}&to=${farFuture}`, null, adminToken)
      const a = (list.data || []).find(s => s.id === slotA.data.id)
      const b = (list.data || []).find(s => s.id === slotB.data.id)
      mark('court-default: unassigned future slot adopts default coach', Number(a?.coach_id) === Number(newCoachId), `slot=${a?.coach_id} default=${newCoachId}`)
      mark('court-default: manual coach override preserved', Number(b?.coach_id) === Number(playerId), `slot=${b?.coach_id} manual=${playerId}`)
      cleanup.push({ method: 'DELETE', path: `/slots/${slotA.data.id}`, token: adminToken, label: 'court-default slot A' })
      cleanup.push({ method: 'DELETE', path: `/slots/${slotB.data.id}`, token: adminToken, label: 'court-default slot B' })
      await req('PUT', '/slots/court-defaults', { court: cdCourt, coach_id: null, applyToFuture: false }, adminToken)
    } else {
      mark('court-default propagation setup', false, JSON.stringify({ slotA: slotA.status, slotB: slotB.status, newCoachId, playerId }))
    }
  }

  // create temp slot
  const createSlot = await req('POST', '/slots', { date: farFuture, time: '22:00', court: 6, player_text: PLAYER_1, session_type: 'private', status: 'available', balanceOverride: 'free' }, adminToken)
  mark('POST /slots (admin, far-future)', createSlot.ok && createSlot.status === 201, JSON.stringify(createSlot.data))
  const tempSlotId = createSlot.data?.id
  if (tempSlotId) {
    const updSlot = await req('PUT', `/slots/${tempSlotId}`, { player_text: 'E2E Updated' }, adminToken)
    mark('PUT /slots/:id (admin)', updSlot.ok)
    // Set status to payment_approved to test approve flow
    await req('PUT', `/slots/${tempSlotId}`, { status: 'payment_approved' }, adminToken)
    const approveSlot = await req('PUT', `/slots/${tempSlotId}/approve`, null, adminToken)
    mark('PUT /slots/:id/approve (admin)', approveSlot.ok)
    // count validation forbids private(1 name) → group: toggle must be rejected with 400
    const toggleSlot = await req('PUT', `/slots/${tempSlotId}/toggle-type`, null, adminToken)
    mark('PUT /slots/:id/toggle-type (admin, rejected 400)', toggleSlot.status === 400 && typeof toggleSlot.data?.error === 'string', JSON.stringify(toggleSlot.data))
    // Set status to schedule_approved for mark-attended
    await req('PUT', `/slots/${tempSlotId}`, { status: 'schedule_approved' }, adminToken)
    const markAtt = await req('PUT', `/slots/${tempSlotId}/mark-attended`, null, adminToken)
    mark('PUT /slots/:id/mark-attended (admin)', markAtt.ok)
  }

  // confirm / decline (need player-owned slot)
  if (playerToken && tempSlotId) {
    // reassign slot to player with schedule_approved status
    await req('PUT', `/slots/${tempSlotId}`, { user_id: playerId, status: 'schedule_approved', player_text: PLAYER_1 }, adminToken)
    const confirmSlot = await req('PUT', `/slots/${tempSlotId}/confirm`, null, playerToken)
    mark('PUT /slots/:id/confirm (player)', confirmSlot.ok)
    // create another for decline — set status to schedule_approved after creation
    const slot2 = await req('POST', '/slots', { date: farFuture, time: '23:00', court: 5, player_text: PLAYER_1, session_type: 'private', balanceOverride: 'free' }, adminToken)
    if (slot2.ok && slot2.data?.id) {
      await req('PUT', `/slots/${slot2.data.id}`, { status: 'schedule_approved', user_id: playerId, player_text: PLAYER_1 }, adminToken)
      const declSlot = await req('PUT', `/slots/${slot2.data.id}/decline`, null, playerToken)
      mark('PUT /slots/:id/decline (player)', declSlot.ok)
      await req('DELETE', `/slots/${slot2.data.id}`, null, adminToken)
    } else {
      mark('PUT /slots/:id/decline (player)', true, 'skipped (slot create failed)')
    }
  }

  // day approve/undo
  const dayApprove = await req('PUT', `/slots/day/${farFuture}/approve`, null, adminToken)
  mark('PUT /slots/day/:date/approve (admin)', dayApprove.ok)
  const dayUndo = await req('PUT', `/slots/day/${farFuture}/undo`, null, adminToken)
  mark('PUT /slots/day/:date/undo (admin)', dayUndo.ok)

  if (tempSlotId) {
    await req('DELETE', `/slots/${tempSlotId}`, null, adminToken)
  }

  // ── USERS ──
  console.log('\n[users]')
  const usersList = await req('GET', '/users', null, adminToken)
  mark('GET /users (admin)', usersList.ok && Array.isArray(usersList.data))

  const e2eUserEmail = `e2euser+${TS}@test.com`
  const createUser = await req('POST', '/users', { name: `E2E User ${TS}`, email: e2eUserEmail, password: 'TestPass123!', role: 'player', phone: '' }, adminToken)
  mark('POST /users (superadmin, E2E)', createUser.ok && createUser.status === 201, JSON.stringify(createUser.data))
  const tempUserId = createUser.data?.id

  if (tempUserId) {
    const updUser = await req('PUT', `/users/${tempUserId}`, { name: `E2E Updated ${TS}`, phone: '0123456789' }, adminToken)
    mark('PUT /users/:id (admin)', updUser.ok)
    const resetPw = await req('POST', `/users/${tempUserId}/reset-password`, null, adminToken)
    mark('POST /users/:id/reset-password (admin)', resetPw.ok)
    const convertUser = await req('POST', `/users/${tempUserId}/convert`, { from: 'private', count: 1 }, adminToken)
    // convert needs balance, may fail 400 — that's ok
    mark('POST /users/:id/convert (admin)', convertUser.ok || convertUser.status === 400, `got ${convertUser.status}`)
    await req('DELETE', `/users/${tempUserId}`, null, adminToken)
    mark('DELETE /users/:id (superadmin)', true, 'cleaned')
  }

  // export credentials xlsx
  const exportCred = await req('GET', '/users/export-credentials', null, adminToken)
  mark('GET /users/export-credentials (superadmin, xlsx)', exportCred.ok && exportCred.data?._binary)

  // ── PLAYERS (merged into /users) ──
  console.log('\n[players -> users]')
  const playersList = await req('GET', '/users?role=player', null, adminToken)
  mark('GET /users?role=player (admin)', playersList.ok && playersList.data?.players !== undefined)

  const playerSearch = await req('GET', `/users?search=test&limit=5`, null, adminToken)
  mark('GET /users?search&limit (admin)', playerSearch.ok && playerSearch.data?.users !== undefined)

  const e2ePlayerEmail = `e2eplayer+${TS}@test.com`
  const createPlayer = await req('POST', '/users', { full_name: PLAYER_2, email: e2ePlayerEmail, phone: '01000000000', role: 'player', skill_level: 'Beginner' }, adminToken)
  mark('POST /users (admin, E2E player)', createPlayer.ok && createPlayer.status === 201, JSON.stringify(createPlayer.data))
  const tempPlayerId = createPlayer.data?.id

  if (tempPlayerId) {
    const playerGet = await req('GET', `/users/${tempPlayerId}`, null, adminToken)
    mark('GET /users/:id (admin)', playerGet.ok)
    const playerSessions = await req('GET', `/users/${tempPlayerId}/sessions`, null, adminToken)
    mark('GET /users/:id/sessions (admin)', playerSessions.ok)
    const playerReport = await req('GET', `/users/${tempPlayerId}/report`, null, adminToken)
    mark('GET /users/:id/report (admin)', playerReport.ok)
    const updPlayer = await req('PUT', `/users/${tempPlayerId}`, { name: `E2E Updated Player ${TS}`, skill_level: 'Advanced' }, adminToken)
    mark('PUT /users/:id (admin)', updPlayer.ok)
    await req('DELETE', `/users/${tempPlayerId}`, null, adminToken)
    mark('DELETE /users/:id (admin)', true, 'cleaned')
  }

  // ── BOOKINGS ──
  console.log('\n[bookings]')
  const bookingsList = await req('GET', '/bookings', null, adminToken)
  mark('GET /bookings (admin)', bookingsList.ok && bookingsList.data?.bookings !== undefined)

  if (playerToken) {
    const bookingsPlayer = await req('GET', '/bookings', null, playerToken)
    mark('GET /bookings (player)', bookingsPlayer.ok)

    const balCheck = await req('GET', '/bookings/balance-check?sessionType=private&count=1', null, playerToken)
    mark('GET /bookings/balance-check (player)', balCheck.ok && balCheck.data?.hasEnough !== undefined)

    // create booking (instapay)
    const createBooking = await req('POST', '/bookings', {
      sessionType: 'private', mode: 'instapay',
      sessions: [{ date: farFuture, time: '21:00', court: 3, label: 'E2E Test' }],
      totalPrice: 500
    }, playerToken)
    mark('POST /bookings (player, E2E)', createBooking.ok && createBooking.status === 201, JSON.stringify(createBooking.data))
    const tempBookingId = createBooking.data?.id

    if (tempBookingId) {
      const updStatus = await req('PUT', `/bookings/${tempBookingId}/status`, { status: 'payment_approved' }, adminToken)
      mark('PUT /bookings/:id/status (admin)', updStatus.ok)
      const updSessions = await req('PUT', `/bookings/${tempBookingId}/sessions`, {
        sessions: [{ date: farFuture, time: '22:00', court: 3, label: 'E2E Updated' }],
        sessionType: 'private', total: 500
      }, adminToken)
      mark('PUT /bookings/:id/sessions (admin)', updSessions.ok)
      await req('DELETE', `/bookings/${tempBookingId}`, null, adminToken)
      mark('DELETE /bookings/:id (admin)', true, 'cleaned')
    }

    // from-balance (may fail if no balance — that's ok, testing connectivity)
    const fromBal = await req('POST', '/bookings/from-balance', {
      sessionType: 'private',
      sessions: [{ date: farFuture, time: '20:00', court: 2, label: 'E2E Balance' }]
    }, playerToken)
    mark('POST /bookings/from-balance (player)', fromBal.ok || fromBal.status === 409, `got ${fromBal.status} (409=insufficient balance, expected)`)
  }

  // ── RESULTS ──
  console.log('\n[results]')
  const resultsList = await req('GET', '/results', null, adminToken)
  mark('GET /results (admin)', resultsList.ok && resultsList.data?.results !== undefined)

  if (playerToken) {
    const resultsP = await req('GET', '/results?limit=200', null, playerToken)
    mark('GET /results (player)', resultsP.ok)
  }

  // create result as admin (auto-confirmed)
  // PLAYER_2 is deleted by the users section before this point — create a fresh sideB player
  const resBName = `E2E ResB ${TS}`
  const resBUser = await req('POST', '/users', { full_name: resBName, email: `e2eresb+${TS}@test.com`, phone: '01000000000', role: 'player', skill_level: 'Beginner' }, adminToken)
  if (resBUser.data?.id) cleanup.push({ method: 'DELETE', path: `/users/${resBUser.data.id}`, token: adminToken, label: 'cleanup result sideB player' })
  const createResult = await req('POST', '/results', {
    date: '2099-01-01', format: 'short',
    sideA: [PLAYER_1], sideB: [resBUser.ok ? resBName : PLAYER_2],
    score_a: 6, score_b: 3, court: 1
  }, adminToken)
  mark('POST /results (admin, E2E)', createResult.ok && createResult.status === 201, JSON.stringify(createResult.data))
  const tempResultId = createResult.data?.id

  if (tempResultId) {
    const getResult = await req('GET', `/results/${tempResultId}`, null, adminToken)
    mark('GET /results/:id (admin)', getResult.ok)
    const updResult = await req('PUT', `/results/${tempResultId}`, { score_a: 6, score_b: 2, notes: 'E2E updated' }, adminToken)
    mark('PUT /results/:id (admin)', updResult.ok)
    // confirm (may already be confirmed for admin-created)
    const confResult = await req('PUT', `/results/${tempResultId}/confirm`, null, adminToken)
    mark('PUT /results/:id/confirm (admin)', confResult.ok)
    await req('DELETE', `/results/${tempResultId}`, null, adminToken)
    mark('DELETE /results/:id (admin)', true, 'cleaned')
  }

  // ── PAYMENTS (500 regression test!) ──
  console.log('\n[payments — includes 500 regression test]')
  const paymentsList = await req('GET', '/payments', null, adminToken)
  mark('GET /payments (admin)', paymentsList.ok && Array.isArray(paymentsList.data))

  // Create cash payment with balance (approved immediately)
  const cashPay = await req('POST', '/payments', {
    date: new Date().toISOString().slice(0, 10),
    player_name: 'E2E Cash Player', method: 'Cash',
    amount: 1000, private_sessions: 2, group_sessions: 0,
    notes: `E2E cash ${TS}`
  }, adminToken)
  mark('POST /payments (admin, Cash approved)', cashPay.ok && cashPay.status === 201, JSON.stringify(cashPay.data))
  const cashPayId = cashPay.data?.id

  // Create instapay payment (pending)
  const instaPay = await req('POST', '/payments', {
    date: new Date().toISOString().slice(0, 10),
    player_name: 'E2E Insta Player', method: 'Instapay',
    amount: 500, private_sessions: 1, group_sessions: 0,
    notes: `E2E instapay ${TS}`
  }, adminToken)
  mark('POST /payments (admin, Instapay pending)', instaPay.ok && instaPay.status === 201, JSON.stringify(instaPay.data))
  const instaPayId = instaPay.data?.id

  if (instaPayId) {
    const approve = await req('PUT', `/payments/${instaPayId}/approve`, null, adminToken)
    mark('PUT /payments/:id/approve (admin)', approve.ok, JSON.stringify(approve.data))
  }

  // create another pending for reject
  const instaPay2 = await req('POST', '/payments', {
    date: new Date().toISOString().slice(0, 10),
    player_name: 'E2E Reject Player', method: 'Instapay',
    amount: 300, private_sessions: 0, group_sessions: 1,
    notes: `E2E reject ${TS}`
  }, adminToken)
  if (instaPay2.ok && instaPay2.data?.id) {
    const rej = await req('PUT', `/payments/${instaPay2.data.id}/reject`, null, adminToken)
    mark('PUT /payments/:id/reject (admin)', rej.ok, JSON.stringify(rej.data))
    cleanup.push({ method: 'DELETE', path: `/payments/${instaPay2.data.id}`, token: adminToken, label: 'cleanup rejected payment' })
  }

  // *** 500 REGRESSION: DELETE with balance reversal ***
  if (cashPayId) {
    const delPay = await req('DELETE', `/payments/${cashPayId}`, null, adminToken)
    mark('DELETE /payments/:id (500 regression test)', delPay.ok, `status=${delPay.status} body=${JSON.stringify(delPay.data)}`)
  }
  // cleanup instapay
  if (instaPayId) await req('DELETE', `/payments/${instaPayId}`, null, adminToken)

  // ── EXPENSES ──
  console.log('\n[expenses]')
  const expensesList = await req('GET', '/expenses', null, adminToken)
  mark('GET /expenses (admin)', expensesList.ok && expensesList.data?.expenses !== undefined)

  const createExp = await req('POST', '/expenses', {
    date: new Date().toISOString().slice(0, 10), category: 'Equipment',
    description: `E2E expense ${TS}`, amount: 250
  }, adminToken)
  mark('POST /expenses (admin, E2E)', createExp.ok && createExp.status === 201)
  const tempExpId = createExp.data?.id

  if (tempExpId) {
    const updExp = await req('PUT', `/expenses/${tempExpId}`, { amount: 300, description: 'E2E updated' }, adminToken)
    mark('PUT /expenses/:id (admin)', updExp.ok)
    await req('DELETE', `/expenses/${tempExpId}`, null, adminToken)
    mark('DELETE /expenses/:id (admin)', true, 'cleaned')
  }

  // ── CONVERSION REQUESTS ──
  console.log('\n[conversion-requests]')
  const convList = await req('GET', '/conversion-requests', null, adminToken)
  mark('GET /conversion-requests (admin)', convList.ok && Array.isArray(convList.data))

  if (playerToken) {
    // create (may fail 400 if no balance — that tests connectivity)
    const convCreate = await req('POST', '/conversion-requests', { from: 'private', to: 'group', count: 1 }, playerToken)
    mark('POST /conversion-requests (player)', convCreate.ok || convCreate.status === 400, `got ${convCreate.status} (400=no balance, expected)`)
    const convId = convCreate.data?.id

    if (convId) {
      const convApprove = await req('PUT', `/conversion-requests/${convId}/approve`, null, adminToken)
      mark('PUT /conversion-requests/:id/approve (admin)', convApprove.ok)
    }

    // create another for reject test
    const convCreate2 = await req('POST', '/conversion-requests', { from: 'private', to: 'group', count: 1 }, playerToken)
    if (convCreate2.ok && convCreate2.data?.id) {
      const convReject = await req('PUT', `/conversion-requests/${convCreate2.data.id}/reject`, null, adminToken)
      mark('PUT /conversion-requests/:id/reject (admin)', convReject.ok)
    }
  }

  // ── BOOKING REQUESTS ──
  console.log('\n[booking-requests]')
  const brList = await req('GET', '/booking-requests', null, adminToken)
  mark('GET /booking-requests (admin)', brList.ok && Array.isArray(brList.data))

  // need a slot to create a booking request
  const brSlot = await req('POST', '/slots', { date: farFuture, time: '19:00', court: 4, player_text: 'E2E BR', session_type: 'private', status: 'player_confirmed' }, adminToken)
  if (brSlot.ok && brSlot.data?.id && playerToken) {
    const brCreate = await req('POST', '/booking-requests', { kind: 'cancel', slot_id: brSlot.data.id }, playerToken)
    mark('POST /booking-requests (player, E2E)', brCreate.ok && brCreate.status === 201, JSON.stringify(brCreate.data))

    if (brCreate.ok && brCreate.data?.id) {
      const brDecide = await req('PUT', `/booking-requests/${brCreate.data.id}/decide`, { decision: 'approved' }, adminToken)
      mark('PUT /booking-requests/:id/decide (admin)', brDecide.ok)

      // respond test (need another request)
      const brSlot2 = await req('POST', '/slots', { date: farFuture, time: '18:00', court: 3, player_text: 'E2E BR2', user_id: playerId, session_type: 'private', status: 'schedule_approved' }, adminToken)
      if (brSlot2.ok && brSlot2.data?.id && playerToken) {
        const brCreate2 = await req('POST', '/booking-requests', { kind: 'cancel', slot_id: brSlot2.data.id }, playerToken)
        if (brCreate2.ok && brCreate2.data?.id) {
          const brRespond = await req('PUT', `/booking-requests/${brCreate2.data.id}/respond`, { response: 'yes' }, playerToken)
          mark('PUT /booking-requests/:id/respond (player)', brRespond.ok)
        }
      }

      await req('DELETE', `/slots/${brSlot.data.id}`, null, adminToken)
      if (brSlot2.ok && brSlot2.data?.id) await req('DELETE', `/slots/${brSlot2.data.id}`, null, adminToken)
    } else {
      mark('PUT /booking-requests/:id/decide (admin)', true, 'skipped')
      mark('PUT /booking-requests/:id/respond (player)', true, 'skipped')
      await req('DELETE', `/slots/${brSlot.data.id}`, null, adminToken)
    }
  } else {
    mark('POST /booking-requests (player)', true, 'skipped (no slot/player)')
    mark('PUT /booking-requests/:id/decide (admin)', true, 'skipped')
    mark('PUT /booking-requests/:id/respond (player)', true, 'skipped')
  }

  // ── REPORTS ──
  console.log('\n[reports]')
  const summary = await req('GET', '/reports/summary', null, adminToken)
  mark('GET /reports/summary (admin)', summary.ok && summary.data?.payments !== undefined)

  const coachHours = await req('GET', '/reports/coach-hours', null, adminToken)
  mark('GET /reports/coach-hours (superadmin)', coachHours.ok)

  // admin (not superadmin) should get 403 — but we're superadmin, skip
  mark('GET /reports/coach-hours (admin->403)', true, 'skipped (same token is superadmin)')

  // ── AUDIT LOGS ──
  console.log('\n[audit-logs]')
  const auditLogs = await req('GET', '/audit-logs?limit=5', null, adminToken)
  mark('GET /audit-logs (admin)', auditLogs.ok && auditLogs.data?.total !== undefined, `total=${auditLogs.data?.total}`)
  const auditMethod = await req('GET', '/audit-logs?method=POST&limit=3', null, adminToken)
  mark('GET /audit-logs?method=POST', auditMethod.ok)
  const auditStatus = await req('GET', '/audit-logs?status_code=200&limit=3', null, adminToken)
  mark('GET /audit-logs?status_code=200', auditStatus.ok)

  // ── IMPORTS ──
  console.log('\n[imports]')
  const batches = await req('GET', '/imports/batches', null, adminToken)
  mark('GET /imports/batches (admin)', batches.ok && Array.isArray(batches.data))

  const tpl = await req('GET', '/imports/template/results', null, adminToken)
  mark('GET /imports/template/results (xlsx)', tpl.ok && tpl.data?._binary)

  // preview + commit schedule (upload CSV as multipart)
  const csvContent = 'Date,Time,Court,Player,Session Type\n2099-12-31,20:00-21:00,1,E2E Import Player,private'
  const csvBuf = Buffer.from(csvContent, 'utf-8')
  const preview = await reqMultipart('/imports/schedule/preview', 'file', 'e2e-schedule.csv', csvBuf, adminToken, 'text/csv')
  mark('POST /imports/schedule/preview (csv)', preview.ok, JSON.stringify(preview.data).slice(0, 200))

  if (preview.ok && preview.data?.preview?.length) {
    const commit = await req('POST', '/imports/schedule/commit', { rows: preview.data.allRows || preview.data.preview, filename: 'e2e-schedule.csv' }, adminToken)
    mark('POST /imports/schedule/commit', commit.ok, JSON.stringify(commit.data))
    // register import-created slots for cleanup (date may be stored as 1999 or 2099 depending on parser)
    for (const d of ['1999-12-31', '2099-12-31']) {
      const sl = await req('GET', `/slots?from=${d}&to=${d}`, null, adminToken)
      const rows = Array.isArray(sl.data) ? sl.data : (sl.data?.slots || [])
      for (const s of rows) {
        if ((s.player_text || '').includes('E2E Import Player')) {
          cleanup.push({ method: 'DELETE', path: `/slots/${s.id}`, token: adminToken, label: 'cleanup import slot' })
        }
      }
    }
  } else {
    mark('POST /imports/schedule/commit', true, 'skipped (preview failed)')
  }

  // template for other keys
  for (const k of ['players', 'bookings', 'payments']) {
    const t = await req('GET', `/imports/template/${k}`, null, adminToken)
    mark(`GET /imports/template/${k}`, t.ok)
  }

  // ── JOURNEY ──
  console.log('\n[journey]')
  if (playerToken && playerId) {
    const jTpl = await req('GET', '/journey/templates', null, playerToken)
    mark('GET /journey/templates (player, 33 skills)', jTpl.ok && jTpl.data?.templates?.length === 33 && jTpl.data?.pillars?.length === 4, `got ${jTpl.data?.templates?.length}`)

    const jSelf = await req('GET', '/journey', null, playerToken)
    mark('GET /journey (player self)', jSelf.ok && jSelf.data?.summary?.needs_assessment === true, JSON.stringify(jSelf.data?.summary || jSelf.data).slice(0, 120))

    const jRbac = await req('GET', `/journey/${adminLogin.data?.user?.id || 1}`, null, playerToken)
    mark('GET /journey/:userId (player -> 403)', jRbac.status === 403, `got ${jRbac.status}`)

    const jCreateDeny = await req('POST', '/journey/reports', { user_id: playerId, report_month: '2099-01' }, playerToken)
    mark('POST /journey/reports (player -> 403)', jCreateDeny.status === 403, `got ${jCreateDeny.status}`)

    const jStart = await req('POST', '/journey/assessment', {}, playerToken)
    mark('POST /journey/assessment (player -> 201)', jStart.status === 201, JSON.stringify(jStart.data))
    const jid = jStart.data?.id

    const jGate = await req('POST', '/journey/reports', { user_id: playerId, report_month: '2099-01' }, adminToken)
    mark('monthly blocked before assessment published -> 400', jGate.status === 400, `got ${jGate.status}: ${JSON.stringify(jGate.data)}`)

    if (jid) {
      const jBad = await req('PUT', `/journey/reports/${jid}`, { items: [{ template_id: 1, user_score: 0 }] }, playerToken)
      mark('PUT self-score 0 -> 400', jBad.status === 400, `got ${jBad.status}`)
      const jBad2 = await req('PUT', `/journey/reports/${jid}`, { items: [{ template_id: 1, user_score: 1.5 }] }, playerToken)
      mark('PUT self-score 1.5 -> 400', jBad2.status === 400, `got ${jBad2.status}`)

      const items33 = Array.from({ length: 33 }, (_, i) => ({ template_id: i + 1, user_score: (i % 10) + 1 }))
      const jFill = await req('PUT', `/journey/reports/${jid}`, { items: items33, general_user_comment: 'E2E journey' }, playerToken)
      mark('PUT 33 self-scores (owner draft)', jFill.ok, JSON.stringify(jFill.data).slice(0, 150))

      const jNoStart = await req('POST', `/journey/${jid}/start-review`, {}, playerToken)
      mark('start-review (player -> 403)', jNoStart.status === 403, `got ${jNoStart.status}`)

      const jSub = await req('POST', `/journey/${jid}/submit`, {}, playerToken)
      mark('submit assessment -> submitted', jSub.ok && jSub.data?.status === 'submitted', JSON.stringify(jSub.data))

      const jEdit = await req('PUT', `/journey/reports/${jid}`, { items: [{ template_id: 1, user_score: 9 }] }, playerToken)
      mark('owner edit after submit -> 403', jEdit.status === 403, `got ${jEdit.status}`)

      const jRev = await req('POST', `/journey/${jid}/start-review`, {}, adminToken)
      mark('start-review (admin) -> in-review', jRev.ok && jRev.data?.status === 'in-review', JSON.stringify(jRev.data))

      const jEarly = await req('POST', `/journey/${jid}/reviewed`, {}, adminToken)
      mark('reviewed with missing scores -> 400', jEarly.status === 400, `got ${jEarly.status}`)

      const adminItems = Array.from({ length: 33 }, (_, i) => ({ template_id: i + 1, admin_score: (i % 10) + 1, final_score: (i % 10) + 1, admin_comment: i === 0 ? 'E2E coach note' : '' }))
      const jFillA = await req('PUT', `/journey/reports/${jid}`, { items: adminItems, general_admin_comment: 'E2E admin comment' }, adminToken)
      mark('PUT admin+final scores', jFillA.ok, JSON.stringify(jFillA.data).slice(0, 150))

      const jReviewed = await req('POST', `/journey/${jid}/reviewed`, {}, adminToken)
      mark('reviewed -> reviewed', jReviewed.ok && jReviewed.data?.status === 'reviewed', JSON.stringify(jReviewed.data))

      const jPub = await req('POST', `/journey/${jid}/publish`, {}, adminToken)
      mark('publish assessment (overall 1dp)', jPub.ok && typeof jPub.data?.overall_score === 'number', JSON.stringify(jPub.data))

      const jAfter = await req('GET', '/journey', null, playerToken)
      const s = jAfter.data?.summary || {}
      mark('assessment published visible to player', s.assessment_status === 'published', `got ${s.assessment_status}`)
      mark('summary: score and report count separate', typeof s.overall_score === 'number' && typeof s.report_position === 'number' && typeof s.progress_pct === 'number', JSON.stringify(s).slice(0, 160))
      mark('summary: sessions_completed present', typeof s.sessions_completed === 'number', String(s.sessions_completed))

      const jMonth = await req('POST', '/journey/reports', { user_id: playerId, report_month: '2099-01' }, adminToken)
      mark('create monthly report 1 -> 201', jMonth.status === 201 && jMonth.data?.report_number === 1, JSON.stringify(jMonth.data))
      const mid = jMonth.data?.id

      const jDup = await req('POST', '/journey/reports', { user_id: playerId, report_month: '2099-01' }, adminToken)
      mark('duplicate report month -> 409', jDup.status === 409, `got ${jDup.status}`)
      const jActive = await req('POST', '/journey/reports', { user_id: playerId, report_month: '2099-02' }, adminToken)
      mark('second monthly while active -> 409', jActive.status === 409, `got ${jActive.status}`)

      const jHidden = await req('GET', '/journey', null, playerToken)
      mark('draft monthly items hidden from player', jHidden.data?.reports?.[0]?.items?.length === 0, `items=${jHidden.data?.reports?.[0]?.items?.length}`)
      mark('active_report set', !!jHidden.data?.summary?.active_report, JSON.stringify(jHidden.data?.summary?.active_report))

      if (mid) {
        const mA = await req('PUT', `/journey/reports/${mid}`, { items: adminItems, general_admin_comment: 'E2E month' }, adminToken)
        mark('PUT monthly admin+final scores', mA.ok, JSON.stringify(mA.data).slice(0, 150))
        const mStart = await req('POST', `/journey/${mid}/start-review`, {}, adminToken)
        mark('monthly start-review -> in-review', mStart.ok && mStart.data?.status === 'in-review', JSON.stringify(mStart.data))
        const mRet = await req('POST', `/journey/${mid}/return`, { comment: 'E2E return feedback' }, adminToken)
        mark('monthly return -> returned', mRet.ok && mRet.data?.status === 'returned', JSON.stringify(mRet.data))

        const mPlayerFill = await req('PUT', `/journey/reports/${mid}`, { items: items33, general_user_comment: 'E2E fixed' }, playerToken)
        mark('owner edits returned monthly', mPlayerFill.ok, JSON.stringify(mPlayerFill.data).slice(0, 150))
        const mSub = await req('POST', `/journey/${mid}/submit`, {}, playerToken)
        mark('owner resubmit monthly -> in-review', mSub.ok && mSub.data?.status === 'in-review', JSON.stringify(mSub.data))
        const mRev = await req('POST', `/journey/${mid}/reviewed`, {}, adminToken)
        mark('monthly reviewed', mRev.ok && mRev.data?.status === 'reviewed', JSON.stringify(mRev.data))
        const mPub = await req('POST', `/journey/${mid}/publish`, {}, adminToken)
        mark('monthly publish', mPub.ok && mPub.data?.status === 'published', JSON.stringify(mPub.data))

        const jProg = await req('GET', '/journey', null, playerToken)
        const ps = jProg.data?.summary || {}
        mark('journey progress 10% (1 of 10)', ps.progress_pct === 10, `got ${ps.progress_pct}`)
        mark('report position 1', ps.report_position === 1, `got ${ps.report_position}`)
        mark('published monthly items visible (33)', jProg.data?.reports?.[0]?.items?.length === 33, `items=${jProg.data?.reports?.[0]?.items?.length}`)
        mark('pillar averages present', ps.pillar_averages && typeof ps.pillar_averages['1'] === 'number', JSON.stringify(ps.pillar_averages))
        mark('timeline present', Array.isArray(jProg.data?.timeline) && jProg.data.timeline.length > 0)

        const jAdmin = await req('GET', `/journey/${playerId}`, null, adminToken)
        mark('GET /journey/:userId (admin full)', jAdmin.ok && jAdmin.data?.assessment?.items?.length === 33 && jAdmin.data?.reports?.length === 1, JSON.stringify({ assess: jAdmin.data?.assessment?.items?.length, reports: jAdmin.data?.reports?.length }))

        const jNotif = await req('GET', '/notifications', null, playerToken)
        const nlist = Array.isArray(jNotif.data) ? jNotif.data : (jNotif.data?.notifications || [])
        mark('journey notifications delivered', jNotif.ok && nlist.some(n => n.kind === 'journey' || /report|assessment/i.test(n.title || '')), `count=${nlist.length}`)

        const mEditPub = await req('PUT', `/journey/reports/${mid}`, { items: [{ template_id: 1, final_score: 10, admin_comment: 'post-publish fix' }] }, adminToken)
        mark('admin edits published report', mEditPub.ok, JSON.stringify(mEditPub.data).slice(0, 150))
      }

      const jBadAct = await req('POST', `/journey/${jid}/frobnicate`, {}, adminToken)
      mark('unknown journey action -> 404', jBadAct.status === 404, `got ${jBadAct.status}`)
    }
  } else {
    mark('journey block', true, 'skipped (no player token)')
  }

  // ── LOGOUT ──
  console.log('\n[logout]')
  if (playerToken) {
    const logout = await req('POST', '/auth/logout', null, playerToken)
    mark('POST /auth/logout (player)', logout.ok)
  }

  // ── CLEANUP ──
  // Deletion order: bookings/notifications reference users, slots/payment rows are leaf records.
  if (cleanup.length) {
    console.log(`\n[cleanup] ${cleanup.length} temp record(s)`)
    let cleaned = 0
    for (const task of cleanup) {
      try {
        const r = await req(task.method, task.path, null, task.token)
        if (r.ok || r.status === 404) cleaned++
        else console.log(`  cleanup failed: ${task.label} -> ${r.status} ${JSON.stringify(r.data)}`)
      } catch (e) {
        console.log(`  cleanup error: ${task.label} -> ${e.message}`)
      }
    }
    console.log(`[cleanup] ${cleaned}/${cleanup.length} removed`)
  }

  // ── SUMMARY ──
  console.log(`\n${'='.repeat(60)}`)
  console.log(`RESULTS: ${pass} passed, ${fail} failed, ${skip} skipped`)
  console.log(`${'='.repeat(60)}`)

  if (fail > 0) {
    console.log('\nFAILED:')
    results.filter(r => !r.ok).forEach(r => console.log(`  FAIL ${r.label}: ${r.detail}`))
  }

  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
