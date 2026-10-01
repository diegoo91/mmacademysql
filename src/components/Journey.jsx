import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useFeedback } from '../context/FeedbackContext'
import { formatDateMed } from '../lib/time'
import {
  Rocket, ClipboardList, Send, Save, ArrowLeft, CheckCircle2, RotateCcw,
  Eye, EyeOff, PlayCircle, CalendarPlus, TrendingUp, Target, ListChecks,
} from 'lucide-react'

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted for Review',
  'in-review': 'In Review',
  returned: 'Returned for Changes',
  reviewed: 'Reviewed',
  published: 'Published',
}

const STATUS_STYLES = {
  draft: 'bg-slate-400/15 text-slate-500 dark:text-slate-300',
  submitted: 'bg-blue-400/15 text-blue-500 dark:text-blue-400',
  'in-review': 'bg-amber-400/15 text-amber-500 dark:text-amber-400',
  returned: 'bg-rose-400/15 text-rose-500 dark:text-rose-400',
  reviewed: 'bg-purple-400/15 text-purple-500 dark:text-purple-400',
  published: 'bg-emerald-400/15 text-emerald-500 dark:text-emerald-400',
}

const PILLAR_DOT = {
  1: 'bg-brand-text',
  2: 'bg-rose-400',
  3: 'bg-blue-400',
  4: 'bg-gold',
}

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = String(ym).split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function scoreOf(v) {
  return v === null || v === undefined || v === '' ? null : Number(v)
}

function StatusPill({ status, label }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.draft
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${cls}`}>
      {label || STATUS_LABELS[status] || status}
    </span>
  )
}

function ScoreBadge({ value }) {
  const v = scoreOf(value)
  if (v === null) return <span className="text-xs text-muted">—</span>
  const color = v >= 9 ? 'text-emerald-500' : v >= 7 ? 'text-brand-text' : v >= 4 ? 'text-amber-500' : 'text-rose-500'
  return (
    <span className={`font-heading font-black ${color}`}>
      {v}<span className="text-[10px] font-bold text-muted">/10</span>
    </span>
  )
}

// Exact spec display formats — label and value on one line.
function SummaryCards({ summary }) {
  const cards = [
    { key: 'sessions', label: 'Sessions completed:', value: summary.sessions_completed ?? 0 },
    { key: 'report', label: '', value: null },
    { key: 'score', label: 'Overall score:', value: summary.overall_score !== null && summary.overall_score !== undefined ? `${summary.overall_score}/10` : '—' },
    { key: 'progress', label: 'Journey progress:', value: `${summary.progress_pct ?? 0}%` },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="glass-card rounded-2xl p-4 text-center bg-white/60 dark:bg-slate-900/60">
          {c.key === 'report' ? (
            <>
              <div className="font-heading text-2xl font-black text-theme">
                Report {summary.report_position ?? 0} of {summary.max_reports ?? 10}
              </div>
              <div className="text-[10px] font-semibold text-muted mt-1 uppercase tracking-wider">Journey report status</div>
            </>
          ) : (
            <>
              <div className="font-heading text-2xl font-black text-theme">
                <span className="text-muted text-sm font-bold mr-1">{c.label}</span>{c.value}
              </div>
              <div className="text-[10px] font-semibold text-muted mt-1 uppercase tracking-wider">
                {c.key === 'sessions' ? 'Player sessions' : c.key === 'score' ? 'Performance' : 'Reports published'}
              </div>
            </>
          )}
        </div>
      ))}
      <div className="col-span-2 lg:col-span-4">
        <div className="w-full h-2 rounded-full bg-surface border border-theme overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, summary.progress_pct ?? 0)}%` }} />
        </div>
      </div>
    </div>
  )
}

function PillarRow({ pillarAverages, pillars }) {
  const list = pillars || []
  const entries = list.filter(p => pillarAverages && pillarAverages[p.id] !== null && pillarAverages[p.id] !== undefined)
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(p => (
        <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-theme text-xs">
          <span className={`w-2 h-2 rounded-full ${PILLAR_DOT[p.id] || 'bg-brand-text'}`} />
          <span className="text-muted font-semibold">{p.label}</span>
          <span className="font-heading font-black text-theme">{pillarAverages[p.id]}/10</span>
        </span>
      ))}
    </div>
  )
}

// Group templates: pillar → section → items (canonical assessment order).
function useGroupedTemplates(templates) {
  return useMemo(() => {
    const groups = []
    const byPillar = new Map()
    for (const t of templates || []) {
      if (!byPillar.has(t.pillar)) {
        const g = { pillar: t.pillar, label: t.section, sections: [] }
        byPillar.set(t.pillar, g)
        groups.push(g)
      }
      const g = byPillar.get(t.pillar)
      let sec = g.sections[g.sections.length - 1]
      if (!sec || sec.name !== t.section) {
        sec = { name: t.section, items: [] }
        g.sections.push(sec)
      }
      sec.items.push(t)
    }
    return groups
  }, [templates])
}

// Pillar labels come from the API; keep a local fallback for safety.
const PILLAR_FALLBACK = { 1: 'Shots', 2: 'Fitness & Physical Capability', 3: 'Movement & Footwork', 4: 'Situation & Game Intelligence' }

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="1"
      max="10"
      step="1"
      disabled={disabled}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') { onChange(null); return }
        const n = parseInt(raw, 10)
        if (Number.isNaN(n)) return
        onChange(Math.min(10, Math.max(1, n)))
      }}
      className="w-16 px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-black text-center focus:border-brand-text focus:outline-none disabled:opacity-50"
      aria-label="Score out of 10"
    />
  )
}

// skills grouped + score inputs per mode.
//   mode 'user'  → user_score + user_comment
//   mode 'admin' → admin_score + final_score + admin_comment
//   mode 'view'  → read-only
function SkillsList({ grouped, pillars, values, mode, onChange, showUserComments, showAdminComments }) {
  const pillarLabel = (p) => pillars?.find(x => x.id === p)?.label || PILLAR_FALLBACK[p] || `Pillar ${p}`
  return (
    <div className="space-y-5">
      {grouped.map(g => (
        <div key={g.pillar}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2.5 h-2.5 rounded-full ${PILLAR_DOT[g.pillar] || 'bg-brand-text'}`} />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-theme">Pillar {g.pillar}: {pillarLabel(g.pillar)}</h4>
          </div>
          <div className="space-y-3">
            {g.sections.map(sec => (
              <div key={sec.name} className="rounded-xl border border-theme bg-white/50 dark:bg-slate-900/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">{sec.name}</p>
                <div className="space-y-1.5">
                  {sec.items.map(t => {
                    const v = values[t.id] || {}
                    const userComment = v.user_comment || ''
                    const adminComment = v.admin_comment || ''
                    return (
                      <div key={t.id} className="rounded-lg bg-surface/60 border border-theme px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="flex-1 text-xs font-semibold text-theme min-w-0">{t.name}</span>
                          {mode === 'view' && <ScoreBadge value={scoreOf(v.final_score) ?? scoreOf(v.user_score) ?? scoreOf(v.admin_score)} />}
                          {mode === 'user' && <ScoreInput value={scoreOf(v.user_score)} onChange={(n) => onChange(t.id, 'user_score', n)} />}
                          {mode === 'admin' && (
                            <>
                              <span className="text-[10px] font-black text-muted shrink-0 hidden sm:inline" title="Player's own self-score">
                                player {scoreOf(v.user_score) ?? '—'}
                              </span>
                              <ScoreInput value={scoreOf(v.admin_score)} onChange={(n) => onChange(t.id, 'admin_score', n)} />
                              <span className="text-[10px] text-muted font-bold">final</span>
                              <ScoreInput value={scoreOf(v.final_score)} onChange={(n) => onChange(t.id, 'final_score', n)} />
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {mode === 'user' && (
                            <input
                              type="text"
                              value={userComment}
                              maxLength={200}
                              onChange={(e) => onChange(t.id, 'user_comment', e.target.value)}
                              placeholder="Comment (optional)"
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-surface border border-theme text-[11px] text-theme placeholder:text-muted focus:border-brand-text focus:outline-none"
                            />
                          )}
                          {(mode === 'view' || mode === 'admin') && showUserComments && userComment && (
                            <span className="text-[11px] text-muted italic truncate max-w-[45%] shrink" title={userComment}>Player: {userComment}</span>
                          )}
                          {mode === 'admin' && (
                            <input
                              type="text"
                              value={adminComment}
                              maxLength={200}
                              onChange={(e) => onChange(t.id, 'admin_comment', e.target.value)}
                              placeholder="Coach comment (optional)"
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-surface border border-theme text-[11px] text-theme placeholder:text-muted focus:border-brand-text focus:outline-none"
                            />
                          )}
                          {mode === 'view' && showAdminComments && adminComment && (
                            <span className="text-[11px] text-brand-text truncate">Coach: {adminComment}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function valuesFromItems(items) {
  const out = {}
  for (const it of items || []) {
    out[it.template_id] = {
      user_score: scoreOf(it.user_score),
      user_comment: it.user_comment || '',
      admin_score: scoreOf(it.admin_score),
      admin_comment: it.admin_comment || '',
      final_score: scoreOf(it.final_score),
    }
  }
  return out
}

function toPayload(values) {
  return Object.entries(values).map(([templateId, v]) => ({
    template_id: Number(templateId),
    user_score: v.user_score ?? null,
    user_comment: v.user_comment || '',
    admin_score: v.admin_score ?? null,
    admin_comment: v.admin_comment || '',
    final_score: v.final_score ?? null,
  }))
}

function CommentsBlock({ report }) {
  const hasUser = (report.general_user_comment || '').trim()
  const hasAdmin = (report.general_admin_comment || '').trim()
  if (!hasUser && !hasAdmin) return null
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {hasUser && (
        <div className="rounded-xl bg-surface border border-theme p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Player comment</p>
          <p className="text-xs text-theme whitespace-pre-wrap">{report.general_user_comment}</p>
        </div>
      )}
      {hasAdmin && (
        <div className="rounded-xl bg-brand/10 border border-brand-text/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text mb-1">Coach comment</p>
          <p className="text-xs text-theme whitespace-pre-wrap">{report.general_admin_comment}</p>
        </div>
      )}
    </div>
  )
}

function ReportMeta({ report }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted font-semibold">
      <span>Created {formatDateMed(report.created_at)}</span>
      <span>Updated {formatDateMed(report.updated_at)}</span>
      {report.published_at && <span className="text-emerald-500">Published {formatDateMed(report.published_at)}</span>}
      {report.report_month && <span>{monthLabel(report.report_month)}</span>}
    </div>
  )
}

function Timeline({ timeline }) {
  if (!timeline?.length) return null
  return (
    <div>
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" /> Journey timeline
      </h4>
      <ol className="space-y-2 border-l-2 border-theme ml-2 pl-4">
        {timeline.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full ${e.status === 'published' ? 'bg-emerald-400' : e.status === 'returned' ? 'bg-rose-400' : 'bg-brand-text'}`} />
            <p className="text-xs font-semibold text-theme">{e.label}</p>
            <p className="text-[10px] text-muted">{formatDateMed(e.date)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function EmptyJourney({ summary, onStart, busy }) {
  return (
    <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-theme bg-surface/50">
      <Rocket className="w-9 h-9 mx-auto text-brand-text mb-3" />
      <h3 className="font-heading text-lg font-black text-theme">Your coaching journey starts here</h3>
      <p className="text-xs text-muted max-w-md mx-auto mt-2 leading-relaxed">
        A {summary.max_reports ?? 10}-report coaching program: begin with an initial self-assessment of every skill,
        then receive a monthly progress report from your coach — each scored from 1 to 10 with comments on every pillar.
      </p>
      <p className="font-heading text-sm font-black text-theme mt-4">
        <span className="text-muted font-bold">Sessions completed:</span> {summary.sessions_completed ?? 0}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
        <button
          onClick={onStart}
          disabled={busy}
          className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center gap-2"
        >
          <Rocket className="w-4 h-4" /> Start Your Journey
        </button>
        <button
          onClick={onStart}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl border border-theme bg-surface text-theme font-bold text-sm hover:border-brand-text transition-all flex items-center gap-2"
        >
          <ClipboardList className="w-4 h-4" /> Initial Assessment
        </button>
      </div>
    </div>
  )
}

// ── shared report card shell ───────────────────────────────────────────

function ReportCard({ open, onToggle, header, status, statusLabel, children }) {
  return (
    <div className="rounded-2xl border border-theme bg-white/60 dark:bg-slate-900/50 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface/60 transition-all">
        {header}
        <span className="flex items-center gap-2 shrink-0">
          <StatusPill status={status} label={statusLabel} />
          {open ? <EyeOff className="w-4 h-4 text-muted" /> : <Eye className="w-4 h-4 text-muted" />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-theme pt-3">{children}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// PLAYER VIEW — Profile.jsx "My Journey"
// ══════════════════════════════════════════════════════════════════════

export default function MyJourneySection() {
  const { toast } = useFeedback()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [view, setView] = useState('main') // main | assessment | report:<id>
  const [openId, setOpenId] = useState(null)

  const grouped = useGroupedTemplates(data?.templates)
  const values = useMemo(() => (data?.assessment ? valuesFromItems(data.assessment.items) : {}), [data])
  const [draft, setDraft] = useState({})
  const [generalComment, setGeneralComment] = useState('')

  const load = useCallback(() => {
    return api.get('/journey').then((d) => {
      setData(d)
      const assessment = d.assessment
      if (assessment && ['draft', 'returned'].includes(assessment.status)) {
        setDraft(valuesFromItems(assessment.items))
        setGeneralComment(assessment.general_user_comment || '')
      } else if (assessment) {
        setDraft(valuesFromItems(assessment.items))
        setGeneralComment('')
      }
      const returned = d.reports.find(r => r.status === 'returned')
      const latestPublished = [...d.reports].reverse().find(r => r.status === 'published')
      setOpenId(returned?.id ?? latestPublished?.id ?? null)
      return d
    }).catch((err) => {
      toast.error(err.message || 'Failed to load your journey')
      throw err
    })
  }, [toast])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const setField = (tplId, field, val) => setDraft(prev => ({
    ...prev,
    [tplId]: { ...(prev[tplId] || {}), [field]: val },
  }))

  const openAssessment = async () => {
    setBusy('start')
    try {
      let d = data
      if (data.summary.needs_assessment) {
        await api.post('/journey/assessment')
        d = await load()
      }
      setDraft(valuesFromItems(d.assessment.items))
      setGeneralComment(d.assessment.general_user_comment || '')
      setView('assessment')
    } catch (err) {
      if (err.status !== 409) toast.error(err.message || 'Could not start your journey')
      else setView('assessment')
    } finally {
      setBusy('')
    }
  }

  const saveAssessment = async (submit) => {
    const scored = Object.values(draft).filter(v => scoreOf(v.user_score) !== null).length
    if (submit && scored < 33) {
      toast.error(`All 33 self-scores are required before submitting (${scored}/33 done)`)
      return
    }
    setBusy(submit ? 'submit' : 'save')
    try {
      await api.put(`/journey/reports/${data.assessment.id}`, { items: toPayload(draft), general_user_comment: generalComment })
      if (submit) {
        await api.post(`/journey/${data.assessment.id}/submit`)
        toast.success('Assessment submitted for review')
        setView('main')
      } else {
        toast.success('Draft saved')
      }
      await load()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setBusy('')
    }
  }

  const resubmitReport = async (reportId) => {
    setBusy(`submit-${reportId}`)
    try {
      await api.post(`/journey/${reportId}/submit`)
      toast.success('Report resubmitted for review')
      await load()
    } catch (err) {
      toast.error(err.message || 'Submit failed')
    } finally {
      setBusy('')
    }
  }

  const openReport = (id) => {
    setView(`report:${id}`)
    const r = data.reports.find(x => x.id === id)
    setDraft(valuesFromItems(r?.items))
    setGeneralComment(r?.general_user_comment || '')
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8">
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }
  if (!data) return null

  const { summary, pillars } = data
  const assessment = data.assessment

  if (view === 'assessment' && assessment) {
    const editable = ['draft', 'returned'].includes(assessment.status)
    const scored = Object.values(draft).filter(v => scoreOf(v.user_score) !== null).length
    return (
      <div id="journey" className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('main')} className="p-2 rounded-xl bg-surface border border-theme hover:border-brand-text transition-all" aria-label="Back to journey">
              <ArrowLeft className="w-4 h-4 text-theme" />
            </button>
            <h2 className="font-heading text-xl font-extrabold text-theme flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-brand-text" /> Initial Assessment
            </h2>
            <StatusPill status={assessment.status} label={assessment.status_label} />
          </div>
          <span className="text-xs font-bold text-muted">{scored}/33 skills scored</span>
        </div>

        {!editable && (
          <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-3 text-xs text-amber-500 dark:text-amber-400 font-semibold">
            This assessment is <strong>{assessment.status_label}</strong> and can no longer be edited
            {assessment.status === 'returned' ? ' — update the highlighted fields and resubmit.' : '.'}
          </div>
        )}

        {editable && (
          <textarea
            value={generalComment}
            maxLength={2000}
            onChange={(e) => setGeneralComment(e.target.value)}
            placeholder="General comment about your goals (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-xs text-theme placeholder:text-muted focus:border-brand-text focus:outline-none resize-y"
          />
        )}

        <SkillsList
          grouped={grouped}
          pillars={pillars}
          values={editable ? { ...values, ...draft } : values}
          mode={editable ? 'user' : 'view'}
          onChange={setField}
          showUserComments
        />

        {editable && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => saveAssessment(false)}
              disabled={busy !== ''}
              className="px-5 py-2.5 rounded-xl border border-theme bg-surface text-theme font-bold text-sm hover:border-brand-text transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button
              onClick={() => saveAssessment(true)}
              disabled={busy !== ''}
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {busy === 'submit' ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        )}
        {assessment.general_admin_comment && <CommentsBlock report={assessment} />}
      </div>
    )
  }

  if (view.startsWith('report:')) {
    const reportId = Number(view.split(':')[1])
    const report = data.reports.find(r => r.id === reportId)
    if (report) {
      const editable = report.status === 'returned'
      const scored = Object.values(draft).filter(v => scoreOf(v.user_score) !== null).length
      return (
        <div id="journey" className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => setView('main')} className="p-2 rounded-xl bg-surface border border-theme hover:border-brand-text transition-all" aria-label="Back to journey">
                <ArrowLeft className="w-4 h-4 text-theme" />
              </button>
              <h2 className="font-heading text-xl font-extrabold text-theme">
                Report {report.report_number} of {report.maximum_reports}
              </h2>
              <StatusPill status={report.status} label={report.status_label} />
            </div>
            <span className="text-xs font-bold text-muted">{scored}/33 skills scored</span>
          </div>
          <ReportMeta report={report} />
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <span className="font-heading font-black text-theme">
              <span className="text-muted text-xs font-bold mr-1">Overall score:</span>{report.overall_score ?? '—'}/10
            </span>
            {report.report_month && <span className="text-xs text-muted font-semibold">{monthLabel(report.report_month)}</span>}
          </div>
          {editable && (
            <div className="rounded-xl bg-rose-400/10 border border-rose-400/30 px-4 py-3 text-xs text-rose-500 dark:text-rose-400 font-semibold">
              This report was returned for changes — update your scores and comments, then resubmit.
            </div>
          )}
          <CommentsBlock report={report} />
          <SkillsList
            grouped={grouped}
            pillars={pillars}
            values={editable ? { ...valuesFromItems(report.items), ...draft } : valuesFromItems(report.items)}
            mode={editable ? 'user' : 'view'}
            onChange={setField}
            showUserComments
            showAdminComments
          />
          {editable && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => resubmitReport(report.id)}
                disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-60"
              >
                <Send className="w-4 h-4" /> {busy === `submit-${report.id}` ? 'Submitting…' : 'Resubmit for review'}
              </button>
              <span className="text-[11px] text-muted self-center">{scored}/33 self-scores set — all 33 required</span>
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div id="journey" className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-heading text-xl font-extrabold text-theme flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-text" /> My Journey
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Coaching progress reports</span>
      </div>

      <SummaryCards summary={summary} />
      <PillarRow pillarAverages={summary.pillar_averages} pillars={pillars} />

      {summary.needs_assessment ? (
        <EmptyJourney summary={summary} onStart={openAssessment} busy={busy === 'start'} />
      ) : (
        <>
          {/* Assessment card */}
          <ReportCard
            open={view === 'assessment'}
            onToggle={() => (view === 'assessment' ? setView('main') : setView('assessment'))}
            status={assessment.status}
            statusLabel={assessment.status_label}
            header={
              <span className="flex items-center gap-2 min-w-0">
                <ClipboardList className="w-4 h-4 text-brand-text shrink-0" />
                <span className="text-sm font-extrabold text-theme truncate">Initial Assessment</span>
                <span className="text-[10px] text-muted font-semibold hidden sm:inline">Baseline · 33 skills</span>
              </span>
            }
          >
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <span className="font-heading font-black text-theme">
                <span className="text-muted text-xs font-bold mr-1">Overall score:</span>{assessment.overall_score ?? '—'}/10
              </span>
              <ReportMeta report={assessment} />
            </div>
            <CommentsBlock report={assessment} />
            <button
              onClick={() => setView('assessment')}
              className="px-4 py-2 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-xs font-bold flex items-center gap-1.5"
            >
              {['draft', 'returned'].includes(assessment.status) ? <><Save className="w-3.5 h-3.5" /> Continue assessment</> : <><Eye className="w-3.5 h-3.5" /> View skills</>}
            </button>
          </ReportCard>

          {/* Monthly reports */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Monthly reports
            </h4>
            {data.reports.length === 0 && (
              <p className="text-xs text-muted rounded-xl border border-dashed border-theme p-4 text-center">
                No monthly reports yet{summary.assessment_published ? ' — your coach will publish Report 1 soon.' : '. Publish your initial assessment first.'}
              </p>
            )}
            {data.reports.map(r => {
              const hasItems = r.items?.length > 0
              return (
                <ReportCard
                  key={r.id}
                  open={openId === r.id}
                  onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                  status={r.status}
                  statusLabel={r.status_label}
                  header={
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-extrabold text-theme truncate">
                        Report {r.report_number} of {r.maximum_reports}
                      </span>
                      <span className="text-[10px] text-muted font-semibold hidden sm:inline">{monthLabel(r.report_month)}</span>
                    </span>
                  }
                >
                  {!hasItems && r.status !== 'returned' ? (
                    <p className="text-xs text-muted py-2">
                      {r.status === 'published' ? 'No items.' : `Your coach is working on this report (${r.status_label}). It becomes visible once published or returned to you.`}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3 items-center text-sm">
                        <span className="font-heading font-black text-theme">
                          <span className="text-muted text-xs font-bold mr-1">Overall score:</span>{r.overall_score ?? '—'}/10
                        </span>
                        <ReportMeta report={r} />
                      </div>
                      <CommentsBlock report={r} />
                      <button
                        onClick={() => openReport(r.id)}
                        className="px-4 py-2 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-xs font-bold flex items-center gap-1.5"
                      >
                        {r.status === 'returned' ? <><Send className="w-3.5 h-3.5" /> Edit & resubmit</> : <><Eye className="w-3.5 h-3.5" /> View full report</>}
                      </button>
                    </>
                  )}
                </ReportCard>
              )
            })}
          </div>

          <Timeline timeline={data.timeline} />
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// ADMIN VIEW — UserDetail.jsx "Journey" tab
// ══════════════════════════════════════════════════════════════════════

export function JourneyTab({ userId }) {
  const { toast, prompt } = useFeedback()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [openId, setOpenId] = useState(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const [adminValues, setAdminValues] = useState({})
  const [assessmentValues, setAssessmentValues] = useState({})

  const grouped = useGroupedTemplates(data?.templates)

  const load = useCallback(() => {
    return api.get(`/journey/${userId}`).then((d) => {
      setData(d)
      const active = d.summary.active_report
      const latest = [...d.reports].reverse().find(r => r.status === 'published')
      setOpenId(active?.id ?? latest?.id ?? null)
      const activeReport = d.reports.find(r => r.id === (active?.id ?? -1))
      setAdminValues(valuesFromItems(activeReport?.items ?? latest?.items ?? []))
      setAssessmentValues(valuesFromItems(d.assessment?.items ?? []))
      return d
    }).catch((err) => {
      toast.error(err.message || 'Failed to load journey')
      throw err
    })
  }, [userId, toast])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const setAdminField = (tplId, field, val) => setAdminValues(prev => ({
    ...prev,
    [tplId]: { ...(prev[tplId] || {}), [field]: val },
  }))
  const setAssessmentField = (tplId, field, val) => setAssessmentValues(prev => ({
    ...prev,
    [tplId]: { ...(prev[tplId] || {}), [field]: val },
  }))

  const saveReport = async (reportId, values, generalComment) => {
    setBusy(`save-${reportId}`)
    try {
      await api.put(`/journey/reports/${reportId}`, {
        items: toPayload(values),
        ...(generalComment !== undefined ? { general_admin_comment: generalComment } : {}),
      })
      toast.success('Report saved')
      await load()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setBusy('')
    }
  }

  const action = async (reportId, name, body) => {
    setBusy(`${name}-${reportId}`)
    try {
      const res = await api.post(`/journey/${reportId}/${name}`, body)
      toast.success(
        name === 'return' ? 'Returned to the player'
        : name === 'publish' ? `Published${res.overall_score != null ? ` — overall ${res.overall_score}/10` : ''}`
        : `Status → ${STATUS_LABELS[res.status] || res.status}`
      )
      await load()
    } catch (err) {
      toast.error(err.message || 'Action failed')
    } finally {
      setBusy('')
    }
  }

  const returnReport = async (report) => {
    const comment = await prompt({
      title: `Return ${report.kind === 'initial' ? 'assessment' : `report ${report.report_number}`} for changes`,
      description: 'The player will be notified and can edit their scores/comments. A comment is optional.',
      label: 'Feedback for the player',
      placeholder: 'Work on the lob and revisit the baseline consistency…',
      confirmLabel: 'Return for changes',
    })
    if (comment === null) return
    await action(report.id, 'return', comment?.trim() ? { comment: comment.trim() } : {})
  }

  const createReport = async () => {
    setBusy('create')
    try {
      const res = await api.post('/journey/reports', { user_id: Number(userId), report_month: month })
      toast.success(`Report ${res.report_number} created`)
      await load()
      setOpenId(res.id)
    } catch (err) {
      toast.error(err.message || 'Create failed')
    } finally {
      setBusy('')
    }
  }

  const startAssessmentForPlayer = async () => {
    setBusy('start-assessment')
    try {
      await api.post('/journey/assessment', { user_id: Number(userId) })
      toast.success('Initial assessment started — the player has been notified')
      await load()
    } catch (err) {
      if (err.status === 409) {
        toast.info('An initial assessment already exists')
        await load()
      } else toast.error(err.message || 'Could not start the assessment')
    } finally {
      setBusy('')
    }
  }

  const fillFinalsFromAdmin = () => {
    setAdminValues(prev => {
      const out = { ...prev }
      for (const [k, v] of Object.entries(out)) {
        if (k === '__general') continue
        if (scoreOf(v.admin_score) !== null && scoreOf(v.final_score) === null) out[k] = { ...v, final_score: v.admin_score }
      }
      return out
    })
    toast.info('Final scores filled from admin scores where empty — review, then save')
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl border border-theme p-6">
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }
  if (!data) return null

  const { summary, pillars, assessment } = data

  const renderActions = (report, values) => {
    const busyKey = (n) => busy === `${n}-${report.id}`
    if (report.status === 'submitted') {
      return (
        <ActionButton busy={busyKey('start-review')} onClick={() => action(report.id, 'start-review')} icon={PlayCircle} label="Start review" />
      )
    }
    if (report.status === 'draft' && report.kind === 'monthly') {
      return (
        <ActionButton busy={busyKey('start-review')} onClick={() => action(report.id, 'start-review')} icon={PlayCircle} label="Start review" />
      )
    }
    if (report.status === 'in-review') {
      return (
        <>
          <ActionButton busy={busyKey('return')} onClick={() => returnReport(report)} icon={RotateCcw} label="Return for changes" tone="rose" />
          <ActionButton
            busy={busyKey('reviewed')}
            onClick={() => action(report.id, 'reviewed')}
            icon={CheckCircle2}
            label="Mark reviewed"
            disabled={Object.values(values).some(v => scoreOf(v.admin_score) === null || scoreOf(v.final_score) === null)}
            title={Object.values(values).some(v => scoreOf(v.admin_score) === null || scoreOf(v.final_score) === null) ? 'Every skill needs an admin + final score first' : ''}
          />
        </>
      )
    }
    if (report.status === 'reviewed') {
      return <ActionButton busy={busyKey('publish')} onClick={() => action(report.id, 'publish')} icon={CheckCircle2} label="Publish" />
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl border border-theme p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-text" /> Journey progress
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Coaching reports</span>
        </div>
        <SummaryCards summary={summary} />
        <PillarRow pillarAverages={summary.pillar_averages} pillars={pillars} />

        {/* create next monthly report */}
        <div className="rounded-xl border border-theme bg-surface/60 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1" htmlFor="journey-month">New monthly report</label>
            <input
              id="journey-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs focus:border-brand-text focus:outline-none"
            />
          </div>
          <button
            onClick={createReport}
            disabled={busy !== '' || !summary.can_create_report}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title={summary.can_create_report ? '' : summary.assessment_status !== 'published' ? 'Publish the initial assessment first' : summary.journey_complete ? 'Journey complete' : 'Finish the active report first'}
          >
            <CalendarPlus className="w-4 h-4" /> Create report
          </button>
          <p className="w-full text-[11px] text-muted font-semibold">
            {summary.assessment_status === 'none' && 'The player has not started their initial assessment yet.'}
            {summary.assessment_status !== 'none' && summary.assessment_status !== 'published' && 'The initial assessment must be published before monthly reports can be created.'}
            {summary.assessment_published && summary.active_report && `Report ${summary.active_report.report_number} (${STATUS_LABELS[summary.active_report.status] || summary.active_report.status}) must finish first.`}
            {summary.journey_complete && 'All reports in this journey are published.'}
            {summary.can_create_report && `Report ${summary.report_position + 1} of ${summary.max_reports} is ready to create.`}
          </p>
        </div>
      </div>

      {/* Initial assessment */}
      {assessment ? (
        <div className="glass-panel rounded-2xl border border-theme p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-heading font-extrabold text-theme flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-brand-text" /> Initial assessment
              <StatusPill status={assessment.status} label={assessment.status_label} />
            </h3>
            <div className="flex flex-wrap gap-2">
              {renderActions(assessment, assessmentValues)}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <span className="font-heading font-black text-theme">
              <span className="text-muted text-xs font-bold mr-1">Overall score:</span>{assessment.overall_score ?? '—'}/10
            </span>
            <ReportMeta report={assessment} />
          </div>
          <textarea
            value={assessmentValues.__general ?? assessment.general_admin_comment ?? ''}
            onChange={(e) => setAssessmentValues(prev => ({ ...prev, __general: e.target.value }))}
            placeholder="General comment for this assessment (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-xs text-theme placeholder:text-muted focus:border-brand-text focus:outline-none resize-y"
          />
          <CommentsBlock report={assessment} />
          <SkillsList
            grouped={grouped}
            pillars={pillars}
            values={{ ...valuesFromItems(assessment.items), ...assessmentValues }}
            mode="admin"
            onChange={setAssessmentField}
            showUserComments
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton
              busy={busy === `save-${assessment.id}`}
              onClick={() => saveReport(assessment.id, stripGeneral(assessmentValues), assessmentValues.__general ?? assessment.general_admin_comment ?? '')}
              icon={Save}
              label="Save scores"
            />
            <ActionButton
              busy={false}
              onClick={() => {
                setAssessmentValues(prev => {
                  const out = { ...prev }
                  for (const [k, v] of Object.entries(out)) {
                    if (k === '__general') continue
                    if (scoreOf(v.admin_score) !== null && scoreOf(v.final_score) === null) out[k] = { ...v, final_score: v.admin_score }
                  }
                  return out
                })
              }}
              icon={Target}
              label="Finals ← admin scores"
              tone="ghost"
            />
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-dashed border-theme p-6 text-center">
          <ClipboardList className="w-7 h-7 mx-auto text-muted mb-2" />
          <p className="text-sm font-bold text-theme">No initial assessment yet</p>
          <p className="text-xs text-muted mt-1">Start it here for the player — they will be notified and can fill in their self-scores from their Profile.</p>
          <button
            type="button"
            onClick={startAssessmentForPlayer}
            disabled={busy !== ''}
            className="mt-3 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Rocket className="w-4 h-4" /> {busy === 'start-assessment' ? 'Starting…' : 'Start initial assessment'}
          </button>
        </div>
      )}

      {/* Monthly reports */}
      <div className="space-y-3">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Monthly reports
        </h4>
        {data.reports.length === 0 && (
          <p className="text-xs text-muted rounded-xl border border-dashed border-theme p-4 text-center">No monthly reports yet.</p>
        )}
        {data.reports.map(r => (
          <div key={r.id} className="glass-panel rounded-2xl border border-theme overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (openId === r.id) { setOpenId(null); return }
                setOpenId(r.id)
                // Load THIS report's saved numbers (adminValues was holding the active report's values)
                setAdminValues(valuesFromItems(r.items ?? []))
              }}
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-surface/60 transition-all"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-theme">Report {r.report_number} of {r.maximum_reports}</span>
                <span className="text-[10px] text-muted font-semibold hidden sm:inline">{monthLabel(r.report_month)}</span>
                <span className="text-[10px] font-black text-theme hidden md:inline">· {r.overall_score ?? '—'}/10</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <StatusPill status={r.status} label={r.status_label} />
                {openId === r.id ? <EyeOff className="w-4 h-4 text-muted" /> : <Eye className="w-4 h-4 text-muted" />}
              </span>
            </button>
            {openId === r.id && (
              <div className="px-5 pb-5 space-y-4 border-t border-theme pt-4">
                <div className="flex flex-wrap gap-3 items-center text-sm">
                  <span className="font-heading font-black text-theme">
                    <span className="text-muted text-xs font-bold mr-1">Overall score:</span>{r.overall_score ?? '—'}/10
                  </span>
                  <ReportMeta report={r} />
                </div>
                <textarea
                  value={adminValues.__general ?? r.general_admin_comment ?? ''}
                  onChange={(e) => setAdminValues(prev => ({ ...prev, __general: e.target.value }))}
                  placeholder="General monthly progress comment (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-xs text-theme placeholder:text-muted focus:border-brand-text focus:outline-none resize-y"
                />
                <CommentsBlock report={r} />
                <SkillsList
                  grouped={grouped}
                  pillars={pillars}
                  values={{ ...valuesFromItems(r.items), ...adminValues }}
                  mode="admin"
                  onChange={setAdminField}
                  showUserComments
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <ActionButton
                    busy={busy === `save-${r.id}`}
                    onClick={() => saveReport(r.id, stripGeneral(adminValues), adminValues.__general ?? r.general_admin_comment ?? '')}
                    icon={Save}
                    label="Save report"
                  />
                  <ActionButton
                    busy={false}
                    onClick={() => fillFinalsFromAdmin()}
                    icon={Target}
                    label="Finals ← admin scores"
                    tone="ghost"
                  />
                  <span className="flex-1" />
                  {renderActions(r, adminValues)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Timeline timeline={data.timeline} />
    </div>
  )
}

function stripGeneral(values) {
  const { __general, ...rest } = values
  void __general
  return rest
}

function ActionButton({ onClick, icon: Icon, label, busy, disabled, tone = 'brand', title }) {
  const tones = {
    brand: 'bg-brand hover:bg-brand-hover text-white',
    rose: 'bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500/20',
    ghost: 'bg-surface border border-theme text-theme hover:border-brand-text',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title || ''}
      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone] || tones.brand}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {busy ? 'Working…' : label}
    </button>
  )
}
