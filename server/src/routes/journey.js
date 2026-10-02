import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requirePermission, getUserPermissions } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditCreate, auditUpdate } from '../middleware/audit.js'
import { notifyUser } from '../utils/notify.js'
import {
  PILLARS,
  JOURNEY_TEMPLATES,
  MAX_REPORTS_DEFAULT,
  STATUS_LABELS,
  isWholeScore,
  round1,
  computeMetrics,
  journeyProgress,
} from '../utils/journey.js'

const router = Router()
router.use(authenticate)

// ── helpers ────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10)
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Completed session = player_confirmed slot on/before today, matched the
// same way enrichPlayer does it (user_id OR player_text name list).
async function completedSessions(userId) {
  const user = await db.get('users', userId)
  if (!user) return 0
  const today = todayStr()
  const name = (user.name || '').toLowerCase()
  const slots = await db.findAll('slots', (s) => {
    if (s.status !== 'player_confirmed') return false
    if ((s.date || '') > today) return false
    if (Number(s.user_id) === Number(userId)) return true
    const names = (s.player_text || '').split(/[/+]/).map(n => n.trim().toLowerCase())
    return names.includes(name)
  })
  return slots.length
}

async function getTemplates() {
  let templates = await db.findAll('assessment_templates')
  if (!templates.length) templates = JOURNEY_TEMPLATES.map((t, i) => ({ id: i + 1, ...t }))
  return [...templates].sort((a, b) => a.sort_order - b.sort_order)
}

async function loadReportOr404(res, id) {
  const report = await db.get('journey_reports', Number(id))
  if (!report) {
    res.status(404).json({ error: 'Report not found' })
    return null
  }
  return report
}

// Items joined with their template (pillar/section/name/sort_order).
async function itemsFor(reportId, templates) {
  const byId = new Map(templates.map(t => [t.id, t]))
  const items = await db.findAll('journey_items', { report_id: reportId })
  return items
    .map((i) => {
      const tpl = byId.get(Number(i.template_id)) || {}
      return {
        ...i,
        template_id: Number(i.template_id),
        pillar: tpl.pillar ?? null,
        section: tpl.section || '',
        name: tpl.name || '',
        sort_order: tpl.sort_order ?? 0,
      }
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

const missingCount = (items, key) => items.filter(i => !isWholeScore(i[key])).length

// Recompute + persist the stored overall score (spec: average of final
// scores, 1 decimal; drafts fall back to admin → user lens on read).
async function storeOverall(reportId, templates) {
  const items = await db.findAll('journey_items', { report_id: reportId })
  const { overall_score } = computeMetrics(items, templates)
  await db.update('journey_reports', reportId, { overall_score: overall_score === null ? null : round1(overall_score) })
  return overall_score
}

function serializeReport(r, items, extra = {}) {
  const metrics = computeMetrics(items, [])
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind,
    report_number: r.report_number,
    maximum_reports: r.maximum_reports,
    report_month: r.report_month,
    status: r.status,
    status_label: STATUS_LABELS[r.status] || r.status,
    overall_score: r.overall_score !== null && r.overall_score !== undefined
      ? Number(r.overall_score)
      : metrics.overall_score,
    general_user_comment: r.general_user_comment || '',
    general_admin_comment: r.general_admin_comment || '',
    created_by: r.created_by ?? null,
    updated_by: r.updated_by ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    published_at: r.published_at || null,
    ...extra,
  }
}

// Timeline events derived from report lifecycle (no separate event table).
function buildTimeline(assessment, reports) {
  const evts = []
  const push = (date, label, status, reportNumber = null) => {
    if (!date) return
    evts.push({ date, label, status, report_number: reportNumber })
  }
  if (assessment) {
    push(assessment.created_at, 'Initial assessment started', assessment.status)
    if (assessment.published_at) push(assessment.published_at, 'Initial assessment published', 'published')
    else if (assessment.status === 'submitted') push(assessment.updated_at, 'Assessment submitted for review', 'submitted')
    else if (assessment.status === 'returned') push(assessment.updated_at, 'Assessment returned for changes', 'returned')
  }
  for (const r of reports) {
    push(r.created_at, r.kind === 'initial' ? 'Initial assessment created' : `Report ${r.report_number} created`, r.status, r.report_number)
    if (r.published_at) push(r.published_at, r.kind === 'initial' ? 'Assessment published' : `Report ${r.report_number} published`, 'published', r.report_number)
    else if (r.status === 'returned') push(r.updated_at, `Report ${r.report_number} returned for changes`, 'returned', r.report_number)
  }
  evts.sort((a, b) => new Date(b.date) - new Date(a.date))
  return evts.slice(0, 30)
}

// Journey summary shared by self + admin views.
function buildSummary({ assessment, reports, sessions, maxReports }) {
  const publishedMonthly = reports.filter(r => r.kind === 'monthly' && r.status === 'published')
  const active = reports.find(r => r.kind === 'monthly' && r.status !== 'published') || null
  const publishedCount = publishedMonthly.length
  return {
    sessions_completed: sessions,
    max_reports: maxReports,
    published_count: publishedCount,
    report_position: publishedCount,
    progress_pct: journeyProgress(publishedCount, maxReports),
    journey_complete: publishedCount >= maxReports,
    assessment_status: assessment ? assessment.status : 'none',
    needs_assessment: !assessment,
    assessment_published: !!assessment && assessment.status === 'published',
    active_report: active
      ? { id: active.id, status: active.status, report_number: active.report_number, report_month: active.report_month }
      : null,
    can_create_report: !!assessment && assessment.status === 'published' && !active && publishedCount < maxReports,
  }
}

// Overall + pillar averages across PUBLISHED work only (published assessment
// baseline + published monthly reports).
function journeyScores(assessment, reports, templates) {
  const published = [
    ...(assessment && assessment.status === 'published' ? assessment.items || [] : []),
    ...reports.filter(r => r.kind === 'monthly' && r.status === 'published').flatMap(r => r.items || []),
  ]
  if (!published.length) return { overall_score: null, pillar_averages: Object.fromEntries(PILLARS.map(p => [p.id, null])) }
  return computeMetrics(published, templates)
}

async function isAdmin(req) {
  const perms = await getUserPermissions(req.user)
  return perms.includes('players')
}

// ── GET /templates — canonical skill list (any authenticated user) ─────
router.get('/templates', async (req, res) => {
  try {
    const templates = await getTemplates()
    res.json({ templates, pillars: PILLARS })
  } catch (err) {
    console.error('Journey templates error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET / — the caller's own journey (players) ─────────────────────────
// Visibility: assessment always (it is theirs); monthly reports fully only
// when published or returned (returned = they must act); other statuses
// come back as metadata so in-progress admin work stays out of the way.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const templates = await getTemplates()
    const all = await db.findAll('journey_reports', { user_id: userId }, { orderBy: [['report_number', 'asc']] })
    const assessmentRow = all.find(r => r.kind === 'initial') || null

    const hydrate = async (r) => {
      const full = r.kind === 'initial' || r.status === 'published' || r.status === 'returned'
      const items = await itemsFor(r.id, templates)
      return serializeReport(r, items, { items: full ? items : [] })
    }

    const assessment = assessmentRow ? await hydrate(assessmentRow) : null
    const monthly = []
    for (const r of all.filter(x => x.kind === 'monthly')) monthly.push(await hydrate(r))

    const scores = journeyScores(assessment, monthly, templates)
    const summary = buildSummary({
      assessment: assessmentRow,
      reports: all,
      sessions: await completedSessions(userId),
      maxReports: assessmentRow?.maximum_reports || monthly[0]?.maximum_reports || MAX_REPORTS_DEFAULT,
    })
    res.json({
      templates,
      pillars: PILLARS,
      assessment,
      reports: monthly,
      summary: { ...summary, overall_score: scores.overall_score, pillar_averages: scores.pillar_averages },
      timeline: buildTimeline(assessmentRow, all.filter(r => r.kind === 'monthly')),
    })
  } catch (err) {
    console.error('Journey self error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /:userId — full journey for one player (admins + coaches) ──────
router.get('/:userId', requirePermission('players'), async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    const user = await db.get('users', userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const templates = await getTemplates()
    const all = await db.findAll('journey_reports', { user_id: userId }, { orderBy: [['report_number', 'asc']] })
    const assessmentRow = all.find(r => r.kind === 'initial') || null
    const hydrate = async (r) => {
      const items = await itemsFor(r.id, templates)
      return serializeReport(r, items, { items })
    }
    const assessment = assessmentRow ? await hydrate(assessmentRow) : null
    const monthly = []
    for (const r of all.filter(x => x.kind === 'monthly')) monthly.push(await hydrate(r))
    const scores = journeyScores(assessment, monthly, templates)
    const summary = buildSummary({
      assessment: assessmentRow,
      reports: all,
      sessions: await completedSessions(userId),
      maxReports: assessmentRow?.maximum_reports || monthly[0]?.maximum_reports || MAX_REPORTS_DEFAULT,
    })
    res.json({
      user: { id: user.id, name: user.name, role: user.role },
      templates,
      pillars: PILLARS,
      assessment,
      reports: monthly,
      summary: { ...summary, overall_score: scores.overall_score, pillar_averages: scores.pillar_averages },
      timeline: buildTimeline(assessmentRow, all.filter(r => r.kind === 'monthly')),
    })
  } catch (err) {
    console.error('Journey admin error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /assessment — start the journey (self), or admin/coach for a player ─
router.post('/assessment', async (req, res) => {
  try {
    const body = req.body || {}
    let userId = req.user.id
    if (body.user_id && Number(body.user_id) !== req.user.id) {
      // Acting on another user requires the players permission (admins + coaches).
      const perms = await getUserPermissions(req.user)
      if (!perms.includes('players')) return res.status(403).json({ error: 'Access denied: players' })
      userId = Number(body.user_id)
      const player = await db.get('users', userId)
      if (!player) return res.status(404).json({ error: 'User not found' })
    }
    const existing = await db.find('journey_reports', r => Number(r.user_id) === Number(userId) && r.kind === 'initial')
    if (existing) return res.status(409).json({ error: 'An initial assessment already exists', report_id: existing.id })
    const templates = await getTemplates()
    const report = await db.transaction(async (t) => {
      const created = await t.insert('journey_reports', {
        user_id: userId,
        kind: 'initial',
        report_number: 0,
        maximum_reports: MAX_REPORTS_DEFAULT,
        report_month: null,
        status: 'draft',
        overall_score: null,
        general_user_comment: '',
        general_admin_comment: '',
        published_at: null,
      })
      await t.insertMany('journey_items', templates.map(tpl => ({
        report_id: created.id,
        template_id: tpl.id,
        user_score: null,
        user_comment: '',
        admin_score: null,
        admin_comment: '',
        final_score: null,
      })))
      return created
    })
    await auditCreate(req, 'journey_report', report.id, { kind: 'initial', status: 'draft', user_id: userId })
    if (userId !== req.user.id) {
      await notifyUser({
        userId,
        kind: 'journey',
        title: 'Your coach started your initial assessment',
        body: 'Open My Journey from your Profile to fill in your 33 self-scores.',
        link: '/profile',
      })
    }
    res.status(201).json({ id: report.id, status: report.status })
  } catch (err) {
    console.error('Create assessment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /reports — admin/coach creates the next monthly report ────────
// Assessment-first gate: the initial assessment must be published.
router.post('/reports', requirePermission('players'), async (req, res) => {
  try {
    const { user_id, report_month, maximum_reports } = req.body || {}
    const userId = Number(user_id)
    if (!userId) return res.status(400).json({ error: 'user_id is required' })
    if (!report_month || !MONTH_RE.test(String(report_month))) {
      return res.status(400).json({ error: 'report_month must be YYYY-MM' })
    }
    const player = await db.get('users', userId)
    if (!player) return res.status(404).json({ error: 'User not found' })
    const assessment = await db.find('journey_reports', r => Number(r.user_id) === userId && r.kind === 'initial')
    if (!assessment) return res.status(400).json({ error: 'Complete the initial assessment first' })
    if (assessment.status !== 'published') return res.status(400).json({ error: 'The initial assessment must be published before the first report' })
    const active = await db.find('journey_reports', r => Number(r.user_id) === userId && r.kind === 'monthly' && r.status !== 'published')
    if (active) return res.status(409).json({ error: 'Finish the current report first', report_id: active.id, status: active.status })
    const dupMonth = await db.find('journey_reports', r => Number(r.user_id) === userId && r.kind === 'monthly' && r.report_month === report_month)
    if (dupMonth) return res.status(409).json({ error: 'A report for this month already exists', report_id: dupMonth.id })
    const maxReports = Number(maximum_reports) > 0 ? Number(maximum_reports) : (assessment.maximum_reports || MAX_REPORTS_DEFAULT)
    const existing = await db.findAll('journey_reports', r => Number(r.user_id) === userId && r.kind === 'monthly')
    const nextNumber = existing.reduce((m, r) => Math.max(m, Number(r.report_number) || 0), 0) + 1
    if (nextNumber > maxReports) return res.status(400).json({ error: `Journey complete: all ${maxReports} reports are done` })
    const templates = await getTemplates()
    const report = await db.transaction(async (t) => {
      const created = await t.insert('journey_reports', {
        user_id: userId,
        kind: 'monthly',
        report_number: nextNumber,
        maximum_reports: maxReports,
        report_month,
        status: 'draft',
        overall_score: null,
        general_user_comment: '',
        general_admin_comment: '',
        published_at: null,
      })
      await t.insertMany('journey_items', templates.map(tpl => ({
        report_id: created.id,
        template_id: tpl.id,
        user_score: null,
        user_comment: '',
        admin_score: null,
        admin_comment: '',
        final_score: null,
      })))
      return created
    })
    await auditCreate(req, 'journey_report', report.id, { kind: 'monthly', report_number: nextNumber, report_month, user_id: userId })
    res.status(201).json({ id: report.id, report_number: nextNumber, status: report.status })
  } catch (err) {
    console.error('Create report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /reports/:id — one report with joined items ────────────────────
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await loadReportOr404(res, req.params.id)
    if (!report) return
    const admin = await isAdmin(req)
    const owner = Number(report.user_id) === Number(req.user.id)
    if (!owner && !admin) return res.status(403).json({ error: 'Access denied' })
    // "Only published reports are fully visible": the owner gets items only
    // for published/returned reports (returned = must edit); admins see all.
    const full = admin || report.kind === 'initial' || report.status === 'published' || report.status === 'returned'
    const templates = await getTemplates()
    const items = await itemsFor(report.id, templates)
    res.json({
      report: serializeReport(report, full ? items : []),
      items: full ? items : [],
      templates,
      pillars: PILLARS,
      editable: full,
    })
  } catch (err) {
    console.error('Journey report get error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PUT /reports/:id — edit content (owner or admin) ───────────────────
// Owner writes user_* fields (only while draft/returned).
// Admin writes admin_* + final_score fields (any status, audit-logged).
router.put('/reports/:id', async (req, res) => {
  try {
    const report = await loadReportOr404(res, req.params.id)
    if (!report) return
    const admin = await isAdmin(req)
    const owner = Number(report.user_id) === Number(req.user.id)
    if (!owner && !admin) return res.status(403).json({ error: 'Access denied' })
    if (owner && !admin) {
      // Players edit their own assessment while draft/returned, but their
      // monthly report only after the coach returns it to them.
      const ok = report.kind === 'initial'
        ? ['draft', 'returned'].includes(report.status)
        : report.status === 'returned'
      if (!ok) return res.status(403).json({ error: `A ${STATUS_LABELS[report.status] || report.status} report cannot be edited` })
    }
    const body = req.body || {}
    const templates = await getTemplates()
    const tplIds = new Set(templates.map(t => Number(t.id)))
    const items = await db.findAll('journey_items', { report_id: report.id })
    const itemsById = new Map(items.map(i => [Number(i.template_id), i]))

    const payload = Array.isArray(body.items) ? body.items : []
    const allowed = owner && !admin
      ? ['user_score', 'user_comment']
      : admin && !owner
        ? ['admin_score', 'admin_comment', 'final_score']
        : ['user_score', 'user_comment', 'admin_score', 'admin_comment', 'final_score']

    const updates = []
    for (const entry of payload) {
      const tplId = Number(entry?.template_id)
      if (!tplIds.has(tplId)) return res.status(400).json({ error: `Unknown skill: ${entry?.template_id}` })
      const item = itemsById.get(tplId)
      if (!item) return res.status(400).json({ error: 'Report item mismatch' })
      const patch = {}
      for (const key of allowed) {
        if (!(key in entry)) continue
        if (key.endsWith('_score')) {
          const v = entry[key]
          if (v === null || v === '') { patch[key] = null; continue }
          const n = Number(v)
          if (!isWholeScore(n)) return res.status(400).json({ error: `${key} must be a whole number from 1 to 10` })
          patch[key] = n
        } else if (key.endsWith('_comment')) {
          const text = String(entry[key] ?? '')
          const err = validateLength(key, text, LIMITS.commentText)
          if (err) return res.status(400).json({ error: err })
          patch[key] = text.trim()
        }
      }
      if (Object.keys(patch).length) updates.push([item.id, patch])
    }

    // General comments — owner writes the user voice, admin writes theirs.
    const generalPatch = {}
    if ('general_user_comment' in body && owner) {
      const text = String(body.general_user_comment ?? '')
      const err = validateLength('Comment', text, LIMITS.commentText)
      if (err) return res.status(400).json({ error: err })
      generalPatch.general_user_comment = text.trim()
    }
    if ('general_admin_comment' in body && admin) {
      const text = String(body.general_admin_comment ?? '')
      const err = validateLength('Comment', text, LIMITS.commentText)
      if (err) return res.status(400).json({ error: err })
      generalPatch.general_admin_comment = text.trim()
    }

    if (!updates.length && !Object.keys(generalPatch).length) {
      return res.status(400).json({ error: 'No changes to save' })
    }
    for (const [id, patch] of updates) await db.update('journey_items', id, patch)
    if (Object.keys(generalPatch).length) await db.update('journey_reports', report.id, generalPatch)
    const overall = await storeOverall(report.id, templates)
    await auditUpdate(req, 'journey_report', report.id, { status: report.status }, { edited_by: admin && !owner ? 'admin' : 'owner', fields: updates.length, overall_score: overall })
    const fresh = await db.get('journey_reports', report.id)
    res.json({ report: serializeReport(fresh, await itemsFor(report.id, templates)), overall_score: overall })
  } catch (err) {
    console.error('Journey report edit error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /:id/:action — lifecycle transitions ──────────────────────────
// actions: submit | start-review | return | reviewed | publish
const ACTIONS = ['submit', 'start-review', 'return', 'reviewed', 'publish']

router.post('/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params
    if (!ACTIONS.includes(action)) return res.status(404).json({ error: 'Endpoint not found' })
    const report = await loadReportOr404(res, id)
    if (!report) return
    const admin = await isAdmin(req)
    const owner = Number(report.user_id) === Number(req.user.id)
    const templates = await getTemplates()
    const items = await db.findAll('journey_items', { report_id: report.id })
    const isInitial = report.kind === 'initial'

    // who may act
    if (action === 'submit') {
      if (!owner) return res.status(403).json({ error: 'Only the player can submit' })
      if (isInitial && !['draft', 'returned'].includes(report.status)) {
        return res.status(403).json({ error: 'Only a draft or returned assessment can be submitted' })
      }
      if (!isInitial && !['draft', 'returned'].includes(report.status)) {
        return res.status(403).json({ error: 'Only a draft or returned report can be submitted' })
      }
      if (missingCount(items, 'user_score') > 0) {
        return res.status(400).json({ error: `All ${items.length} self-scores are required before submitting (1–10)` })
      }
      const to = isInitial ? 'submitted' : 'in-review'
      const before = report.status
      await db.update('journey_reports', report.id, { status: to })
      await storeOverall(report.id, templates)
      await auditUpdate(req, 'journey_report', report.id, { status: before }, { status: to })
      return res.json({ status: to })
    }

    // remaining actions are admin/coach only
    if (!admin) return res.status(403).json({ error: 'Access denied' })

    if (action === 'start-review') {
      const from = isInitial ? ['submitted'] : ['draft']
      if (!from.includes(report.status)) {
        return res.status(403).json({ error: `Cannot start review from "${STATUS_LABELS[report.status] || report.status}"` })
      }
      await db.update('journey_reports', report.id, { status: 'in-review' })
      await auditUpdate(req, 'journey_report', report.id, { status: report.status }, { status: 'in-review' })
      return res.json({ status: 'in-review' })
    }

    if (action === 'return') {
      if (report.status !== 'in-review') return res.status(403).json({ error: 'Only a report in review can be returned' })
      const comment = String(req.body?.comment ?? '').trim()
      const patch = { status: 'returned' }
      if (comment) {
        const err = validateLength('Comment', comment, LIMITS.commentText)
        if (err) return res.status(400).json({ error: err })
        patch.general_admin_comment = comment
      }
      await db.update('journey_reports', report.id, patch)
      await auditUpdate(req, 'journey_report', report.id, { status: report.status }, { status: 'returned' })
      await notifyUser({
        userId: report.user_id,
        kind: 'journey',
        title: isInitial ? 'Assessment returned for changes' : `Report ${report.report_number} returned for changes`,
        body: comment || 'Your coach left feedback — open My Journey to continue.',
        link: '/profile',
      })
      return res.json({ status: 'returned' })
    }

    if (action === 'reviewed') {
      if (report.status !== 'in-review') return res.status(403).json({ error: 'Only a report in review can be marked reviewed' })
      if (missingCount(items, 'admin_score') > 0 || missingCount(items, 'final_score') > 0) {
        return res.status(400).json({ error: 'Every skill needs an admin score and a final score before it can be reviewed' })
      }
      await db.update('journey_reports', report.id, { status: 'reviewed' })
      await storeOverall(report.id, templates)
      await auditUpdate(req, 'journey_report', report.id, { status: report.status }, { status: 'reviewed' })
      return res.json({ status: 'reviewed' })
    }

    if (action === 'publish') {
      if (report.status !== 'reviewed') return res.status(403).json({ error: 'Only a reviewed report can be published' })
      if (missingCount(items, 'final_score') > 0) {
        return res.status(400).json({ error: 'Every skill needs a final score (1–10) before publishing' })
      }
      const overall = await storeOverall(report.id, templates)
      const publishedAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
      await db.update('journey_reports', report.id, { status: 'published', published_at: publishedAt })
      await auditUpdate(req, 'journey_report', report.id, { status: report.status }, { status: 'published', overall_score: overall })
      await notifyUser({
        userId: report.user_id,
        kind: 'journey',
        title: isInitial ? 'Initial assessment published' : `Report ${report.report_number} of ${report.maximum_reports} published`,
        body: overall !== null ? `Overall score: ${overall}/10 — open My Journey to see it.` : 'Open My Journey to view it.',
        link: '/profile',
      })
      return res.json({ status: 'published', overall_score: overall })
    }

    return res.status(404).json({ error: 'Endpoint not found' })
  } catch (err) {
    console.error('Journey transition error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
