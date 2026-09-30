import { Router } from 'express'
import db from '../db.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { auditCreate, auditUpdate, auditDelete } from '../middleware/audit.js'
import { notifyUsers } from '../utils/notify.js'
import {
  SKILL_LEVELS,
  validateTournamentInput,
  signupCap,
  knockoutSizeFor,
  buildKnockoutRows,
  buildGroupRows,
  evaluateKnockout,
  computeStandings,
  seedQualifierKnockout,
  autoDistributeIntoGroups,
  parseDbTs,
} from '../utils/tournament.js'

const router = Router()

const ADMIN_ROLES = ['superadmin', 'admin']
const today = () => new Date().toISOString().slice(0, 10)

async function loadTournament(id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return null
  return db.get('tournaments', n)
}

function hydrateMatches(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return rows.map((r) => {
    if (r.next_match_id == null) return { ...r, next_round: null, next_slot: null, next_side: null }
    const nx = byId.get(r.next_match_id)
    return {
      ...r,
      next_round: nx ? nx.round_no : null,
      next_slot: nx ? nx.slot_index : null,
      next_side: r.slot_index % 2 === 0 ? 'a' : 'b',
    }
  })
}

async function activeAdminIds() {
  const admins = await db.findAll('users', (u) =>
    (u.role === 'admin' || u.role === 'superadmin') && u.account_status === 'active')
  return admins.map((a) => a.id)
}

async function playerIdsOfSignupRows(signups) {
  return [...new Set(signups.flatMap((s) => [s.player1_id, s.player2_id]).filter(Boolean))]
}

async function userNames(ids) {
  const set = new Set(ids.filter(Boolean))
  if (!set.size) return new Map()
  const users = await db.findAll('users', (u) => set.has(u.id))
  return new Map(users.map((u) => [u.id, u.name]))
}

function teamDisplayName(name1, name2, custom) {
  const customName = String(custom || '').trim()
  if (customName) return customName.slice(0, 160)
  return name2 ? `${name1} & ${name2}` : String(name1 || '').slice(0, 160)
}

function shuffle(arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function sameIds(a, b) {
  if (a.length !== b.length) return false
  const sa = [...a].map(Number).sort((x, y) => x - y)
  const sb = [...b].map(Number).sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

async function activeSignups(tournamentId) {
  return db.findAll('tournament_signups', (s) =>
    s.tournament_id === tournamentId && (s.status === 'pending' || s.status === 'approved'))
}

async function notifySignupClosed(t) {
  const signups = await db.findAll('tournament_signups', (s) =>
    s.tournament_id === t.id && s.status !== 'withdrawn' && s.status !== 'rejected')
  const playerIds = await playerIdsOfSignupRows(signups)
  await notifyUsers(playerIds, {
    kind: 'tournament_signup_closed',
    title: 'Tournament signups closed',
    body: `Registration for "${t.name}" is closed. The draw is coming soon.`,
    link: '/tournament',
  })
  await notifyUsers(await activeAdminIds(), {
    kind: 'tournament_signup_closed',
    title: 'Tournament signups closed',
    body: `"${t.name}" registration is closed — ready to finalize teams.`,
    link: '/admin/tournament',
  })
}

async function insertMatchRows(t, rows) {
  const idByKey = new Map()
  const sorted = [...rows].sort((a, b) => (b.round_no - a.round_no) || (a.slot_index - b.slot_index))
  let count = 0
  for (const row of sorted) {
    const nextId = row.next_round != null ? (idByKey.get(`${row.next_round}:${row.next_slot}`) ?? null) : null
    const rec = await db.insert('tournament_matches', {
      tournament_id: t.id,
      phase: row.phase,
      group_label: row.group_label ?? null,
      round_no: row.round_no,
      slot_index: row.slot_index,
      next_match_id: nextId,
      team_a_id: row.team_a_id ?? null,
      team_b_id: row.team_b_id ?? null,
      format: t.match_format,
      status: row.status || 'scheduled',
      winner_team_id: null,
      score_a: null,
      score_b: null,
      court: null,
      scheduled_at: null,
    })
    idByKey.set(`${row.round_no}:${row.slot_index}`, rec.id)
    count += 1
  }
  return count
}

async function mirrorToResults(t, actorId) {
  const teams = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
  const allMatches = await db.findAll('tournament_matches', (m) => m.tournament_id === t.id)
  const matches = allMatches.filter((m) => m.status === 'completed')
  // later-round knockout rows may have NULL team sides (only round 1 is
  // persisted); resolve them from the winner graph like the read path does
  const koResolved = new Map(
    evaluateKnockout(hydrateMatches(allMatches.filter((x) => x.phase === 'knockout'))).map((x) => [x.id, x]),
  )
  const teamById = new Map(teams.map((x) => [x.id, x]))
  const playerIds = teams.flatMap((x) => [x.player1_id, x.player2_id])
  const names = await userNames(playerIds)
  let created = 0
  for (const m of matches) {
    if (m.score_a == null || m.score_b == null) continue
    const resolved = m.phase === 'knockout' ? koResolved.get(m.id) : null
    const aId = m.team_a_id ?? resolved?.a ?? null
    const bId = m.team_b_id ?? resolved?.b ?? null
    const winId = m.winner_team_id ?? resolved?.winner ?? null
    if (!aId || !bId || !winId) continue
    const A = teamById.get(aId)
    const B = teamById.get(bId)
    if (!A || !B) continue
    const marker = `tournament:${t.id}:m${m.id}`
    const existing = await db.find('results', (r) => r.notes === marker)
    if (existing) continue
    const sideA = [names.get(A.player1_id), A.player2_id ? names.get(A.player2_id) : null].filter(Boolean)
    const sideB = [names.get(B.player1_id), B.player2_id ? names.get(B.player2_id) : null].filter(Boolean)
    if (!sideA.length || !sideB.length) continue
    const aWon = winId === A.id
    await db.insert('results', {
      date: m.scheduled_at ? String(m.scheduled_at).slice(0, 10) : today(),
      format: t.match_format,
      sideA,
      sideB,
      sideA_ids: [A.player1_id, A.player2_id].filter(Boolean),
      sideB_ids: [B.player1_id, B.player2_id].filter(Boolean),
      side_a: sideA.join(' / '),
      side_b: sideB.join(' / '),
      player_a: sideA[0],
      player_b: sideB[0],
      score_a: m.score_a,
      score_b: m.score_b,
      score_text: `${m.score_a}–${m.score_b}`,
      winner_side: aWon ? 'A' : 'B',
      winner: (aWon ? sideA : sideB)[0],
      status: 'confirmed',
      submitted_by: actorId ?? null,
      court: m.court || 1,
      competition: t.name,
      notes: marker,
    })
    created += 1
  }
  return created
}

async function buildKnockoutFromStandings(t) {
  const teams = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
  const groupRows = await db.findAll('tournament_matches', (m) => m.tournament_id === t.id && m.phase === 'group')
  const standings = computeStandings(teams, groupRows)
  const bracketSize = knockoutSizeFor(t)
  const seeded = seedQualifierKnockout({
    standings,
    advancePerGroup: Number(t.advance_per_group),
    bracketSize,
  })
  if (!seeded.ok) return { ok: false, error: seeded.error }
  const build = buildKnockoutRows({ teamIds: seeded.seedTeams.map((s) => s.id), bracketSize })
  if (!build.ok) return { ok: false, error: build.error }
  const seedById = new Map(seeded.seedTeams.map((s, i) => [s.id, i + 1]))
  for (const s of seeded.seedTeams) {
    await db.update('tournament_teams', s.id, { seed: seedById.get(s.id) })
  }
  await insertMatchRows(t, build.rows)
  return { ok: true, bracket_size: bracketSize, qualifiers: seeded.seedTeams.length }
}

// ── Admin list (before public /:id so 'manage' is not swallowed) ──────────
router.get('/manage', authenticate, requirePermission('results'), async (req, res) => {
  try {
    const rows = await db.findAll('tournaments')
    const out = []
    for (const t of rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
      const signups = await activeSignups(t.id)
      out.push({ ...t, signup_count: signups.length })
    }
    res.json({ tournaments: out })
  } catch (err) {
    console.error('Tournament list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Member player lookup for pair signups (names only, members only) ─────
router.get('/players/search', authenticate, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase()
    if (q.length < 2) return res.json({ players: [] })
    const rows = await db.findAll('users', (u) =>
      u.role === 'player' &&
      (!u.account_status || u.account_status === 'active') &&
      u.name && u.name.toLowerCase().includes(q))
    res.json({ players: rows.slice(0, 10).map((u) => ({ id: u.id, full_name: u.name })) })
  } catch (err) {
    console.error('Player search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Public list (drafts hidden) ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rows = await db.findAll('tournaments')
    let visible = rows.filter((t) => t.status !== 'draft')
    const skill = String(req.query.skill || '').trim()
    if (skill && SKILL_LEVELS.includes(skill)) visible = visible.filter((t) => t.skill_level === skill)
    visible.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const out = []
    for (const t of visible) {
      const signups = await activeSignups(t.id)
      out.push({ ...t, signup_count: signups.length })
    }
    res.json({ tournaments: out })
  } catch (err) {
    console.error('Public tournament list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Player signup (window + full + pair enforced server-side) ────────────
router.post('/:id/signup', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'player') {
      return res.status(403).json({ error: 'Only members can sign up for tournaments' })
    }
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status !== 'registration_open') {
      return res.status(409).json({ error: 'Registration is not open for this tournament' })
    }
    const closesAt = parseDbTs(t.registration_close_at)
    if (closesAt && closesAt < new Date()) {
      return res.status(409).json({ error: 'Registration deadline has passed' })
    }
    const me = req.user.id
    let player2Id = req.body.player2_id ? Number(req.body.player2_id) : null
    if (player2Id === me) player2Id = null
    if (req.body.player2_id && player2Id !== Number(req.body.player2_id)) {
      return res.status(400).json({ error: 'Invalid partner id' })
    }
    let partner = null
    if (player2Id) {
      partner = await db.get('users', player2Id)
      if (!partner || partner.role !== 'player' || (partner.account_status && partner.account_status !== 'active')) {
        return res.status(400).json({ error: 'Partner must be an active member player' })
      }
    }
    const existing = await db.findAll('tournament_signups', (s) =>
      s.tournament_id === t.id && s.status !== 'rejected' && s.status !== 'withdrawn')
    const taken = (uid) => existing.some((s) => s.player1_id === uid || s.player2_id === uid)
    if (taken(me)) return res.status(409).json({ error: 'You are already signed up for this tournament' })
    if (player2Id && taken(player2Id)) {
      return res.status(409).json({ error: 'Your partner is already signed up for this tournament' })
    }
    const cap = signupCap(t)
    const teamsCount = await db.count('tournament_teams', (x) => x.tournament_id === t.id)
    if (existing.length + teamsCount >= cap) {
      return res.status(409).json({ error: `Tournament is full (${cap} teams max)` })
    }
    const fee = Number(t.entry_fee) || 0
    let payment = null
    if (fee > 0) {
      const count = await db.count('payments')
      payment = await db.insert('payments', {
        ref: `PAY-${String(count + 1).padStart(4, '0')}`,
        date: today(),
        player_name: req.user.name,
        player_id: me,
        method: 'Instapay',
        amount: fee,
        private_sessions: 0,
        group_sessions: 0,
        notes: `Tournament entry: ${t.name}`,
        status: 'payment_pending',
        booking_id: null,
        tournament_id: t.id,
      })
    }
    const signup = await db.insert('tournament_signups', {
      tournament_id: t.id,
      team_name: req.body.team_name ? String(req.body.team_name).slice(0, 160) : null,
      player1_id: me,
      player2_id: player2Id,
      status: 'pending',
      payment_id: payment ? payment.id : null,
    })
    await auditCreate(req, 'tournament_signup', signup.id, {
      tournament: t.name, player1_id: me, player2_id: player2Id, fee,
    })
    const admins = await activeAdminIds()
    await notifyUsers(admins, {
      kind: 'tournament_signup',
      title: 'New tournament signup',
      body: `${req.user.name}${partner ? ` & ${partner.name}` : ''} signed up for "${t.name}"`,
      link: '/admin/tournament',
    })
    if (fee > 0) {
      await notifyUsers(admins, {
        kind: 'new_payment',
        title: 'Tournament entry payment pending',
        body: `${fee} EGP entry fee for "${t.name}" — approve in Payments`,
        link: '/admin',
      })
    }
    res.status(201).json({
      ok: true,
      signup: {
        id: signup.id,
        status: signup.status,
        payment_required: fee > 0,
        payment_status: payment ? payment.status : null,
      },
      payment: payment ? { id: payment.id, ref: payment.ref, amount: Number(payment.amount) } : null,
    })
  } catch (err) {
    console.error('Tournament signup error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/my-signup', authenticate, async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const me = req.user.id
    const rows = await db.findAll('tournament_signups', (s) =>
      s.tournament_id === t.id && (s.player1_id === me || s.player2_id === me))
    const signups = await Promise.all(rows.map(async (s) => {
      const pay = s.payment_id ? await db.get('payments', s.payment_id) : null
      return { ...s, payment_ref: pay ? pay.ref : null, payment_status: pay ? pay.status : null }
    }))
    res.json({ signups })
  } catch (err) {
    console.error('My signup error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Public detail (admins also see drafts) ────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const isAdmin = req.user && ADMIN_ROLES.includes(req.user.role)
    if (t.status === 'draft' && !isAdmin) return res.status(404).json({ error: 'Tournament not found' })
    const teams = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
    const rawMatches = await db.findAll('tournament_matches', (m) => m.tournament_id === t.id)
    const matches = hydrateMatches(rawMatches)
    const koRows = matches.filter((m) => m.phase === 'knockout')
    const groupRows = matches.filter((m) => m.phase === 'group')
    const standings = groupRows.length ? computeStandings(teams, groupRows) : null
    const knockout = koRows.length ? evaluateKnockout(koRows) : null
    const signups = await activeSignups(t.id)
    res.json({
      tournament: t,
      teams,
      matches,
      knockout,
      standings,
      signup_count: signups.length,
    })
  } catch (err) {
    console.error('Tournament detail error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Everything below is admin-only ────────────────────────────────────────
router.use(authenticate)
router.use(requirePermission('results'))

router.post('/', async (req, res) => {
  try {
    const v = validateTournamentInput(req.body)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const format = req.body.format
    const groupsFormat = format === 'groups_knockout'
    const rec = {
      name: v.name,
      skill_level: req.body.skill_level,
      format,
      status: 'draft',
      bracket_size: groupsFormat
        ? Number(req.body.groups_count) * Number(req.body.advance_per_group)
        : Number(req.body.bracket_size),
      groups_count: groupsFormat ? Number(req.body.groups_count) : null,
      teams_per_group: groupsFormat ? Number(req.body.teams_per_group) : null,
      advance_per_group: groupsFormat ? Number(req.body.advance_per_group) : null,
      match_format: req.body.match_format,
      entry_fee: Number(req.body.entry_fee ?? 0),
      count_to_records: req.body.count_to_records ? 1 : 0,
      registration_open_at: req.body.registration_open_at || null,
      registration_close_at: req.body.registration_close_at || null,
      notes: req.body.notes ? String(req.body.notes).slice(0, 2000) : null,
    }
    if (rec.registration_open_at && rec.registration_close_at) rec.status = 'registration_open'
    const created = await db.insert('tournaments', rec)
    await auditCreate(req, 'tournament', created.id, { name: created.name, format, skill_level: created.skill_level })
    res.status(201).json({ ok: true, tournament: created })
  } catch (err) {
    console.error('Tournament create error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const teamsCount = await db.count('tournament_teams', (x) => x.tournament_id === t.id)
    const matchesCount = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (teamsCount > 0 || matchesCount > 0) {
      return res.status(409).json({ error: 'Cannot edit a tournament after teams are set' })
    }
    const merged = { ...t, ...req.body }
    const v = validateTournamentInput(merged)
    if (!v.ok) return res.status(400).json({ error: v.error })
    const groupsFormat = merged.format === 'groups_knockout'
    const patch = {
      name: v.name,
      skill_level: merged.skill_level,
      format: merged.format,
      match_format: merged.match_format,
      bracket_size: groupsFormat
        ? Number(merged.groups_count) * Number(merged.advance_per_group)
        : Number(merged.bracket_size),
      groups_count: groupsFormat ? Number(merged.groups_count) : null,
      teams_per_group: groupsFormat ? Number(merged.teams_per_group) : null,
      advance_per_group: groupsFormat ? Number(merged.advance_per_group) : null,
      entry_fee: Number(merged.entry_fee ?? 0),
      registration_open_at: merged.registration_open_at || null,
      registration_close_at: merged.registration_close_at || null,
      notes: merged.notes ? String(merged.notes).slice(0, 2000) : null,
    }
    const updated = await db.update('tournaments', t.id, patch)
    await auditUpdate(req, 'tournament', t.id, t, patch)
    res.json({ ok: true, tournament: updated })
  } catch (err) {
    console.error('Tournament update error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/open', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const matchesCount = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (matchesCount > 0) return res.status(409).json({ error: 'Draw already exists' })
    const openAt = req.body.open_at || new Date().toISOString()
    const closeAt = t.registration_close_at || null
    const closeAtDt = parseDbTs(closeAt)
    if (closeAtDt && new Date(openAt) >= closeAtDt) {
      return res.status(400).json({ error: 'close_at must be after open_at' })
    }
    const updated = await db.update('tournaments', t.id, {
      status: 'registration_open',
      registration_open_at: openAt,
      registration_close_at: closeAt,
    })
    await auditUpdate(req, 'tournament', t.id, { status: t.status }, { status: 'registration_open' })
    res.json({ ok: true, tournament: updated })
  } catch (err) {
    console.error('Tournament open error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/close', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status !== 'registration_open') {
      return res.status(409).json({ error: 'Tournament registration is not open' })
    }
    const updated = await db.update('tournaments', t.id, { status: 'registration_closed' })
    await auditUpdate(req, 'tournament', t.id, { status: t.status }, { status: 'registration_closed' })
    await notifySignupClosed(t)
    res.json({ ok: true, tournament: updated })
  } catch (err) {
    console.error('Tournament close error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status === 'in_progress' || t.status === 'completed') {
      return res.status(409).json({ error: 'Cannot delete a tournament that has started or finished' })
    }
    const matchesCount = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (matchesCount > 0) return res.status(409).json({ error: 'Draw already exists — cannot delete' })
    await db.remove('tournaments', t.id)
    await auditDelete(req, 'tournament', t.id, { name: t.name, status: t.status })
    res.json({ ok: true })
  } catch (err) {
    console.error('Tournament delete error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id/signups', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const signups = await db.findAll('tournament_signups', (s) => s.tournament_id === t.id,
      { orderBy: [['id', 'asc']] })
    const ids = signups.flatMap((s) => [s.player1_id, s.player2_id]).filter(Boolean)
    const names = await userNames(ids)
    const out = []
    for (const s of signups) {
      let payment_status = null
      if (s.payment_id) {
        const pay = await db.get('payments', s.payment_id)
        payment_status = pay ? pay.status : null
      }
      out.push({
        ...s,
        player1_name: names.get(s.player1_id) || null,
        player2_name: s.player2_id ? (names.get(s.player2_id) || null) : null,
        payment_status,
      })
    }
    res.json({ signups: out, entry_fee: Number(t.entry_fee) || 0 })
  } catch (err) {
    console.error('Signup list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/signups/:sid', async (req, res) => {
  try {
    const sid = Number(req.params.sid)
    if (!Number.isInteger(sid) || sid <= 0) return res.status(404).json({ error: 'Signup not found' })
    const s = await db.get('tournament_signups', sid)
    if (!s) return res.status(404).json({ error: 'Signup not found' })
    const status = req.body.status
    if (!['approved', 'rejected', 'withdrawn'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved, rejected, or withdrawn' })
    }
    const t = await db.get('tournaments', s.tournament_id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (status === 'approved') {
      const fee = Number(t.entry_fee) || 0
      if (fee > 0) {
        const pay = s.payment_id ? await db.get('payments', s.payment_id) : null
        if (!pay || pay.status !== 'payment_approved') {
          return res.status(409).json({ error: 'Entry payment must be approved in Payments first' })
        }
      }
    }
    const updated = await db.update('tournament_signups', s.id, { status })
    await auditUpdate(req, 'tournament_signup', s.id, { status: s.status }, { status })
    const ids = [s.player1_id, s.player2_id].filter(Boolean)
    await notifyUsers(ids, {
      kind: 'tournament_signup',
      title: `Signup ${status}`,
      body: `Your signup for "${t.name}" was ${status}`,
      link: '/tournament',
    })
    res.json({ ok: true, signup: updated })
  } catch (err) {
    console.error('Signup update error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/pair-solos', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const aId = Number(req.body.signup_a_id)
    const bId = Number(req.body.signup_b_id)
    if (!Number.isInteger(aId) || aId <= 0 || !Number.isInteger(bId) || bId <= 0) {
      return res.status(404).json({ error: 'Signups not found in this tournament' })
    }
    const a = await db.get('tournament_signups', aId)
    const b = await db.get('tournament_signups', bId)
    if (!a || !b || a.tournament_id !== t.id || b.tournament_id !== t.id) {
      return res.status(404).json({ error: 'Signups not found in this tournament' })
    }
    if (a.id === b.id) return res.status(400).json({ error: 'Pick two different signups' })
    for (const s of [a, b]) {
      if (s.player2_id) return res.status(409).json({ error: 'Only solo signups can be paired' })
      if (s.status === 'rejected' || s.status === 'withdrawn') {
        return res.status(409).json({ error: 'Cannot pair a rejected/withdrawn signup' })
      }
    }
    const fee = Number(t.entry_fee) || 0
    if (fee > 0) {
      const payA = a.payment_id ? await db.get('payments', a.payment_id) : null
      const payB = b.payment_id ? await db.get('payments', b.payment_id) : null
      if (!payA || payA.status !== 'payment_approved' || !payB || payB.status !== 'payment_approved') {
        return res.status(409).json({ error: 'Both entry payments must be approved in Payments first' })
      }
    }
    const names = await userNames([a.player1_id, b.player1_id])
    const teamName = teamDisplayName(names.get(a.player1_id), names.get(b.player1_id), req.body.team_name)
    const updatedA = await db.update('tournament_signups', a.id, {
      player2_id: b.player1_id,
      team_name: teamName,
      status: 'approved',
    })
    await db.update('tournament_signups', b.id, { status: 'withdrawn' })
    await auditUpdate(req, 'tournament_signup', a.id,
      { player2_id: null, status: a.status },
      { player2_id: b.player1_id, status: 'approved', team_name: teamName })
    await notifyUsers([a.player1_id, b.player1_id], {
      kind: 'tournament_signup',
      title: 'Paired into a team',
      body: `You were paired as "${teamName}" for "${t.name}"`,
      link: '/tournament',
    })
    res.json({ ok: true, signup: updatedA })
  } catch (err) {
    console.error('Pair solos error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function validateTeamPlayers(t, player1Id, player2Id, excludeTeamId = null) {
  const p1 = await db.get('users', player1Id)
  if (!p1 || p1.role !== 'player') return 'player1 must be an active member player'
  if (player2Id) {
    if (player2Id === player1Id) return 'a team needs two different players'
    const p2 = await db.get('users', player2Id)
    if (!p2 || p2.role !== 'player') return 'player2 must be an active member player'
  }
  const onTeams = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id && x.id !== excludeTeamId)
  for (const team of onTeams) {
    const ids = [team.player1_id, team.player2_id].filter(Boolean)
    if (ids.includes(player1Id) || (player2Id && ids.includes(player2Id))) {
      return 'a player is already on a team in this tournament'
    }
  }
  const signups = await activeSignups(t.id)
  for (const s of signups) {
    const ids = [s.player1_id, s.player2_id].filter(Boolean)
    if (ids.includes(player1Id) || (player2Id && ids.includes(player2Id))) {
      return 'a player already has a signup in this tournament'
    }
  }
  return null
}

router.post('/:id/teams', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status === 'in_progress' || t.status === 'completed') {
      return res.status(409).json({ error: 'Tournament has already started' })
    }
    const player1Id = Number(req.body.player1_id)
    const player2Id = req.body.player2_id ? Number(req.body.player2_id) : null
    if (!Number.isInteger(player1Id) || player1Id <= 0) return res.status(400).json({ error: 'player1_id is required' })
    if (player2Id != null && (!Number.isInteger(player2Id) || player2Id <= 0)) {
      return res.status(400).json({ error: 'player2_id must be a valid user id' })
    }
    const err = await validateTeamPlayers(t, player1Id, player2Id)
    if (err) return res.status(409).json({ error: err })
    const cap = signupCap(t)
    const teamsCount = await db.count('tournament_teams', (x) => x.tournament_id === t.id)
    const signups = await activeSignups(t.id)
    if (teamsCount + signups.length >= cap) {
      return res.status(409).json({ error: `Tournament is full (${cap} teams max)` })
    }
    const names = await userNames([player1Id, player2Id])
    const team = await db.insert('tournament_teams', {
      tournament_id: t.id,
      team_name: teamDisplayName(names.get(player1Id), player2Id ? names.get(player2Id) : null, req.body.team_name),
      player1_id: player1Id,
      player2_id: player2Id,
      source: 'admin',
      status: 'active',
    })
    await auditCreate(req, 'tournament_team', team.id, { tournament: t.name, team_name: team.team_name })
    res.status(201).json({ ok: true, team })
  } catch (err) {
    console.error('Add team error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/teams/:tid', async (req, res) => {
  try {
    const tid = Number(req.params.tid)
    if (!Number.isInteger(tid) || tid <= 0) return res.status(404).json({ error: 'Team not found' })
    const team = await db.get('tournament_teams', tid)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const t = await db.get('tournaments', team.tournament_id)
    const matchesCount = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (matchesCount > 0) return res.status(409).json({ error: 'Draw already exists' })
    const patch = {}
    if (req.body.team_name !== undefined) {
      patch.team_name = String(req.body.team_name || '').trim().slice(0, 160) || team.team_name
    }
    const p1 = req.body.player1_id !== undefined ? Number(req.body.player1_id) : team.player1_id
    const p2 = req.body.player2_id !== undefined
      ? (req.body.player2_id ? Number(req.body.player2_id) : null)
      : team.player2_id
    const err = await validateTeamPlayers(t, p1, p2, team.id)
    if (err) return res.status(409).json({ error: err })
    patch.player1_id = p1
    patch.player2_id = p2
    if (!req.body.team_name || !String(req.body.team_name).trim()) {
      const names = await userNames([p1, p2])
      patch.team_name = teamDisplayName(names.get(p1), p2 ? names.get(p2) : null, null)
    }
    const updated = await db.update('tournament_teams', team.id, patch)
    await auditUpdate(req, 'tournament_team', team.id, team, patch)
    res.json({ ok: true, team: updated })
  } catch (err) {
    console.error('Update team error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/teams/:tid', async (req, res) => {
  try {
    const tid = Number(req.params.tid)
    if (!Number.isInteger(tid) || tid <= 0) return res.status(404).json({ error: 'Team not found' })
    const team = await db.get('tournament_teams', tid)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const t = await db.get('tournaments', team.tournament_id)
    const matchesCount = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (matchesCount > 0) return res.status(409).json({ error: 'Draw already exists' })
    await db.remove('tournament_teams', team.id)
    await auditDelete(req, 'tournament_team', team.id, { team_name: team.team_name })
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete team error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/draw', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status !== 'registration_closed') {
      return res.status(409).json({ error: 'Close registrations before finalizing the draw' })
    }
    const existingMatches = await db.count('tournament_matches', (m) => m.tournament_id === t.id)
    if (existingMatches > 0) return res.status(409).json({ error: 'Draw already exists' })
    const signups = await db.findAll('tournament_signups', (s) =>
      s.tournament_id === t.id && s.status === 'approved')
    if (signups.some((s) => !s.player2_id)) {
      return res.status(400).json({ error: 'Pair solo signups before drawing (pair-solos)' })
    }
    const existingTeams = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
    const signupPlayerIds = signups.map((s) => s.player1_id)
    const newTeams = []
    for (const s of signups) {
      if (existingTeams.some((x) => x.player1_id === s.player1_id)) continue
      if (!signupPlayerIds.includes(s.player1_id)) continue
      const names = await userNames([s.player1_id, s.player2_id])
      const team = await db.insert('tournament_teams', {
        tournament_id: t.id,
        team_name: teamDisplayName(names.get(s.player1_id), names.get(s.player2_id), s.team_name),
        player1_id: s.player1_id,
        player2_id: s.player2_id,
        source: 'signup',
        status: 'active',
      })
      newTeams.push(team)
    }
    const roster = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id, { orderBy: [['id', 'asc']] })
    if (roster.length < 2) return res.status(400).json({ error: 'Need at least 2 teams to draw' })
    const cap = signupCap(t)
    if (roster.length > cap) return res.status(400).json({ error: `${roster.length} teams exceed the ${cap} limit` })

    const rosterIds = roster.map((x) => x.id)
    let order = rosterIds
    if (req.body.mode === 'random') {
      order = shuffle(rosterIds)
    } else if (Array.isArray(req.body.order)) {
      // accepts team ids (teams already exist) or player1 ids (pre-draw,
      // signups materialize into teams during this same call)
      const given = req.body.order.map(Number)
      if (sameIds(given, rosterIds)) {
        order = given
      } else if (sameIds(given, roster.map((x) => x.player1_id))) {
        order = [...roster].sort(
          (a, b) => given.indexOf(a.player1_id) - given.indexOf(b.player1_id),
        ).map((x) => x.id)
      } else {
        return res.status(400).json({ error: 'order must list every team exactly once (team ids or player ids)' })
      }
    }

    if (t.format === 'knockout') {
      const build = buildKnockoutRows({ teamIds: order, bracketSize: Number(t.bracket_size) })
      if (!build.ok) return res.status(400).json({ error: build.error })
      for (let i = 0; i < order.length; i++) {
        await db.update('tournament_teams', order[i], { seed: i + 1 })
      }
      const count = await insertMatchRows(t, build.rows)
      await db.update('tournaments', t.id, { status: 'in_progress' })
      await auditCreate(req, 'tournament_draw', t.id, { format: 'knockout', teams: roster.length, matches: count })
      await notifyUsers(roster.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean), {
        kind: 'tournament_draw',
        title: 'Draw published',
        body: `The draw for "${t.name}" is ready — good luck!`,
        link: '/tournament',
      })
      return res.json({ ok: true, teams: roster.length, matches: count })
    }

    let groupMap
    if (req.body.groups && typeof req.body.groups === 'object') {
      const labels = Object.keys(req.body.groups)
      if (labels.length !== Number(t.groups_count)) {
        return res.status(400).json({ error: `Expected exactly ${t.groups_count} groups` })
      }
      groupMap = {}
      const flat = []
      for (const label of labels) {
        const ids = (req.body.groups[label] || []).map(Number)
        if (!ids.length) return res.status(400).json({ error: `Group ${label} is empty` })
        // accept team ids or player1 ids (pre-draw groups from signups)
        const mapped = ids.map((id) =>
          (rosterIds.includes(id) ? id : roster.find((x) => x.player1_id === id)?.id))
        if (mapped.some((x) => x == null)) {
          return res.status(400).json({ error: `Group ${label} contains an unknown team or player` })
        }
        groupMap[label.slice(0, 4)] = mapped
        flat.push(...mapped)
      }
      if (!sameIds(flat, rosterIds)) {
        return res.status(400).json({ error: 'Every team must be assigned to exactly one group' })
      }
    } else {
      groupMap = autoDistributeIntoGroups(order, Number(t.groups_count))
    }
    const seedOrder = Object.values(groupMap).flat()
    for (const [label, ids] of Object.entries(groupMap)) {
      for (let i = 0; i < ids.length; i++) {
        await db.update('tournament_teams', ids[i], { group_label: label, seed: seedOrder.indexOf(ids[i]) + 1 })
      }
    }
    const build = buildGroupRows({
      groups: Object.entries(groupMap).map(([label, ids]) => ({ label, teamIds: ids })),
    })
    const count = await insertMatchRows(t, build)
    await db.update('tournaments', t.id, { status: 'in_progress' })
    await auditCreate(req, 'tournament_draw', t.id, { format: 'groups_knockout', teams: roster.length, matches: count })
    await notifyUsers(roster.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean), {
      kind: 'tournament_draw',
      title: 'Groups published',
      body: `The groups for "${t.name}" are ready — good luck!`,
      link: '/tournament',
    })
    res.json({ ok: true, teams: roster.length, matches: count, groups: groupMap })
  } catch (err) {
    console.error('Draw error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/matches/:mid', async (req, res) => {
  try {
    const mid = Number(req.params.mid)
    if (!Number.isInteger(mid) || mid <= 0) return res.status(404).json({ error: 'Match not found' })
    const m = await db.get('tournament_matches', mid)
    if (!m) return res.status(404).json({ error: 'Match not found' })
    const t = await db.get('tournaments', m.tournament_id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status !== 'in_progress') {
      return res.status(409).json({ error: 'Tournament is not in progress' })
    }
    const hasScore = req.body.score_a !== undefined && req.body.score_b !== undefined
    if (!hasScore) {
      const patch = {}
      if (req.body.court !== undefined) patch.court = req.body.court ? Number(req.body.court) : null
      if (req.body.scheduled_at !== undefined) patch.scheduled_at = req.body.scheduled_at || null
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' })
      const updated = await db.update('tournament_matches', m.id, patch)
      return res.json({ ok: true, match: updated })
    }
    if (m.status === 'completed') {
      return res.status(409).json({ error: 'Result already recorded for this match' })
    }
    const sa = Number(req.body.score_a)
    const sb = Number(req.body.score_b)
    if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0 || sa === sb) {
      return res.status(400).json({ error: 'Scores must be whole numbers >= 0 and cannot be tied' })
    }
    let aId = m.team_a_id
    let bId = m.team_b_id
    if (m.phase === 'knockout') {
      const raw = await db.findAll('tournament_matches', (x) => x.tournament_id === t.id && x.phase === 'knockout')
      const ev = evaluateKnockout(hydrateMatches(raw))
      const mev = ev.find((x) => x.id === m.id)
      if (!mev || !mev.playable || !mev.a || !mev.b) {
        return res.status(409).json({ error: 'Match teams are not ready yet' })
      }
      aId = mev.a
      bId = mev.b
    } else if (!aId || !bId) {
      return res.status(400).json({ error: 'Both teams must be set for group matches' })
    }
    const winner = sa > sb ? aId : bId
    const patch = {
      score_a: sa,
      score_b: sb,
      winner_team_id: winner,
      status: 'completed',
    }
    if (m.phase === 'knockout') {
      // persist resolved sides so mirrors/exports can read them directly
      patch.team_a_id = aId
      patch.team_b_id = bId
    }
    if (req.body.court !== undefined) patch.court = req.body.court ? Number(req.body.court) : null
    if (req.body.scheduled_at !== undefined) patch.scheduled_at = req.body.scheduled_at || null
    const updated = await db.update('tournament_matches', m.id, patch)
    await auditUpdate(req, 'tournament_match', m.id, { status: m.status }, { status: 'completed', score_a: sa, score_b: sb })

    const result = { ok: true, match: updated, groups_completed: false, knockout_built: false, tournament_completed: false, mirrored: 0 }
    if (m.phase === 'group') {
      const all = await db.findAll('tournament_matches', (x) => x.tournament_id === t.id)
      const groupRows = all.filter((x) => x.phase === 'group')
      if (groupRows.length && groupRows.every((x) => x.status === 'completed')) {
        result.groups_completed = true
        if (!all.some((x) => x.phase === 'knockout')) {
          const built = await buildKnockoutFromStandings(t)
          if (!built.ok) return res.status(400).json({ error: built.error })
          result.knockout_built = true
          const roster = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
          await notifyUsers(roster.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean), {
            kind: 'tournament_draw',
            title: 'Knockout stage set',
            body: `The knockout bracket for "${t.name}" is ready`,
            link: '/tournament',
          })
        }
      }
    } else if (m.next_match_id == null) {
      await db.update('tournaments', t.id, { status: 'completed' })
      result.tournament_completed = true
      if (Number(t.count_to_records) === 1) {
        result.mirrored = await mirrorToResults(t, req.user.id)
      }
      const roster = await db.findAll('tournament_teams', (x) => x.tournament_id === t.id)
      const champ = roster.find((x) => x.id === winner)
      await notifyUsers(roster.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean), {
        kind: 'tournament_completed',
        title: 'Tournament finished',
        body: champ ? `"${t.name}" finished — champions: ${champ.team_name}` : `"${t.name}" has finished`,
        link: '/tournament',
      })
    }
    res.json(result)
  } catch (err) {
    console.error('Match result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id/count-to-records', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    const enabled = !!req.body.enabled
    const updated = await db.update('tournaments', t.id, { count_to_records: enabled ? 1 : 0 })
    let mirrored = 0
    if (enabled && t.status === 'completed') {
      mirrored = await mirrorToResults(t, req.user.id)
    }
    await auditUpdate(req, 'tournament', t.id, { count_to_records: t.count_to_records }, { count_to_records: enabled ? 1 : 0 })
    res.json({ ok: true, tournament: updated, mirrored })
  } catch (err) {
    console.error('count-to-records error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/complete', async (req, res) => {
  try {
    const t = await loadTournament(req.params.id)
    if (!t) return res.status(404).json({ error: 'Tournament not found' })
    if (t.status === 'completed') return res.status(409).json({ error: 'Tournament is already completed' })
    if (t.status === 'draft' || t.status === 'registration_open') {
      return res.status(409).json({ error: 'Close registrations first' })
    }
    await db.update('tournaments', t.id, { status: 'completed' })
    let mirrored = 0
    if (Number(t.count_to_records) === 1) {
      mirrored = await mirrorToResults(t, req.user.id)
    }
    await auditUpdate(req, 'tournament', t.id, { status: t.status }, { status: 'completed' })
    res.json({ ok: true, mirrored })
  } catch (err) {
    console.error('Complete tournament error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
