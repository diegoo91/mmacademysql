import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useFeedback } from '../context/FeedbackContext'
import { formatDateMed } from '../lib/time'
import {
  Rocket, ClipboardList, Send, Save, ArrowLeft, CheckCircle2, RotateCcw,
  Eye, EyeOff, PlayCircle, CalendarPlus, TrendingUp, Target, ListChecks,
  ChevronDown, Minus, Plus, RefreshCw, AlertTriangle, BarChart3,
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

const PILLAR_BAR = {
  1: 'bg-brand',
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

// After "Fill finals", move focus to the first final score that is still empty (R3).
function focusFirstEmptyFinal(tableId) {
  requestAnimationFrame(() => {
    const sel = `[data-skills="${tableId}"] input[data-field="final"]`
    const inputs = [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null)
    const target = inputs.find(el => el.value === '') || inputs[0]
    if (target) { target.focus(); target.select() }
  })
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

// SVG score ring — theme-safe colors (stroke-brand from @theme, neutral track).
function ScoreRing({ value, size = 88 }) {
  const v = scoreOf(value)
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = v === null ? 0 : Math.max(0, Math.min(10, v)) / 10
  return (
    <div className="relative shrink-0" role="img" style={{ width: size, height: size }} aria-label={v === null ? 'No score yet' : `Overall score: ${v}/10`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-black/10 dark:text-white/10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
          strokeLinecap="round" className="text-brand transition-all duration-500"
          strokeDasharray={`${pct * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading font-black text-theme leading-none" style={{ fontSize: Math.round(size * 0.26) }}>
          {v ?? '—'}<span className="text-[10px] font-bold text-muted">/10</span>
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-muted mt-0.5">Overall</span>
      </div>
    </div>
  )
}

// Loading skeleton (R6) — replaces bare spinners.
function SkeletonPanel() {
  const bar = 'rounded-lg bg-black/10 dark:bg-white/10 animate-pulse'
  return (
    <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-5" role="status" aria-busy="true" aria-label="Loading journey">
      <div className={`h-7 w-52 ${bar}`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <div key={i} className={`h-20 rounded-2xl ${bar}`} />)}
      </div>
      <div className={`h-2 w-full rounded-full ${bar}`} />
      <div className="space-y-2.5">
        {[0, 1, 2].map(i => <div key={i} className={`h-5 ${bar}`} style={{ width: `${92 - i * 14}%` }} />)}
      </div>
    </div>
  )
}

// Actionable error state with retry (R6).
function ErrorPanel({ message, onRetry }) {
  return (
    <div className="glass-panel rounded-3xl border border-theme p-8 text-center">
      <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-3" />
      <p className="text-sm font-bold text-theme">Could not load the journey</p>
      <p className="text-xs text-muted mt-1.5 max-w-md mx-auto">{message || 'Something went wrong while fetching the data.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm inline-flex items-center gap-2 transition-all"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
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

// Pillar averages as mini bars (R2) — value shown as text, color is never the only signal.
function PillarRow({ pillarAverages, pillars }) {
  const list = pillars || []
  const entries = list.filter(p => pillarAverages && pillarAverages[p.id] !== null && pillarAverages[p.id] !== undefined)
  if (!entries.length) return null
  return (
    <div className="grid sm:grid-cols-2 gap-2.5">
      {entries.map(p => {
        const v = scoreOf(pillarAverages[p.id])
        const pct = v === null ? 0 : (Math.max(0, Math.min(10, v)) / 10) * 100
        return (
          <div key={p.id} className="rounded-xl border border-theme bg-white/50 dark:bg-slate-900/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${PILLAR_DOT[p.id] || 'bg-brand-text'}`} />
                <span className="text-[11px] font-bold text-muted truncate">{p.label}</span>
              </span>
              <span className="font-heading font-black text-theme text-xs shrink-0">{v}/10</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${PILLAR_BAR[p.id] || 'bg-brand'} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10
}

function lensValue(v) {
  if (!v) return null
  const f = scoreOf(v.final_score)
  if (f !== null) return f
  const a = scoreOf(v.admin_score)
  if (a !== null) return a
  return scoreOf(v.user_score)
}

function trendPoints(data) {
  const pts = []
  const a = data?.assessment
  const aScore = a ? scoreOf(a.overall_score) : null
  if (aScore !== null) pts.push({ label: 'Baseline', value: aScore })
  const reports = [...(data?.reports || [])].sort((x, y) => (x.report_number || 0) - (y.report_number || 0))
  for (const r of reports) {
    const v = scoreOf(r.overall_score)
    if (v !== null) pts.push({ label: `R${r.report_number}`, value: v })
  }
  return pts
}

const PILLAR_SHORT = { 1: 'Shots', 2: 'Fitness', 3: 'Movement', 4: 'Intel' }
const PILLAR_FILL = { 1: 'fill-brand-text', 2: 'fill-rose-400', 3: 'fill-blue-400', 4: 'fill-gold' }

function TrendChart({ points }) {
  if (!points.length) return null
  const W = 640, H = 190, L = 30, R = 16, T = 20, B = 30
  const iw = W - L - R, ih = H - T - B
  const px = (i) => points.length === 1 ? L + iw / 2 : L + (i * iw) / (points.length - 1)
  const py = (v) => T + ih - (Math.max(0, Math.min(10, v)) / 10) * ih
  const grid = [0, 2, 4, 6, 8, 10]
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ')
  const area = points.length > 1
    ? `${line} L${px(points.length - 1).toFixed(1)},${T + ih} L${px(0).toFixed(1)},${T + ih} Z`
    : ''
  const desc = points.map(p => `${p.label} ${p.value} out of 10`).join(', ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Score progression: ${desc}`}>
      {grid.map(g => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={py(g)} y2={py(g)} stroke="currentColor" strokeWidth="1" className="text-black/10 dark:text-white/10" />
          <text x={L - 6} y={py(g) + 3} textAnchor="end" fontSize="9" fontWeight="800" fill="currentColor" className="text-muted">{g}</text>
        </g>
      ))}
      {area && <path d={area} fill="currentColor" className="text-brand" fillOpacity="0.10" />}
      {points.length > 1 && (
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand" />
      )}
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <title>{`${p.label}: ${p.value}/10`}</title>
          <circle cx={px(i)} cy={py(p.value)} r="4.5" className="fill-white dark:fill-slate-900" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          <text x={px(i)} y={py(p.value) - 9} textAnchor="middle" fontSize="10" fontWeight="900" fill="currentColor" className="text-brand-text">{p.value}</text>
          <text x={px(i)} y={H - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" className="text-muted">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

function TrendPanel({ points }) {
  if (points.length < 2) return null
  return (
    <div className="rounded-2xl border border-theme bg-white/60 dark:bg-slate-900/50 p-4 sm:p-5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-theme flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-brand-text" /> Score progression
        </h4>
        <span className="text-[10px] font-bold text-muted">Overall score across reports · 0-10</span>
      </div>
      <TrendChart points={points} />
    </div>
  )
}

function PillarRadar({ averages, pillars }) {
  const list = (pillars || []).slice().sort((a, b) => a.id - b.id)
  if (!list.length) return null
  const S = 380, C = S / 2, RAD = 110
  const n = list.length
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i, r) => [C + Math.cos(angle(i)) * r, C + Math.sin(angle(i)) * r]
  const poly = (fn) => list.map((_, i) => pt(i, fn(i)).map(v => v.toFixed(1)).join(',')).join(' ')
  const ringPoly = (level) => poly(() => (level / 10) * RAD)
  const valueOf = (p) => scoreOf(averages?.[p.id])
  const dataPoly = poly((i) => {
    const v = valueOf(list[i])
    return ((v === null ? 0 : Math.max(0, Math.min(10, v))) / 10) * RAD
  })
  const hasData = list.some(p => valueOf(p) !== null)
  const desc = list.map(p => `${PILLAR_SHORT[p.id] || p.label} ${valueOf(p) ?? 'no score'} out of 10`).join(', ')
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-auto max-w-[340px]" role="img" aria-label={`Pillar profile: ${desc}`}>
      {[2, 4, 6, 8, 10].map(lvl => (
        <polygon
          key={lvl}
          points={ringPoly(lvl)}
          fill="none"
          stroke="currentColor"
          strokeWidth={lvl === 10 ? 1.5 : 1}
          className={lvl === 10 ? 'text-black/20 dark:text-white/20' : 'text-black/10 dark:text-white/10'}
        />
      ))}
      {list.map((_, i) => {
        const [x, y] = pt(i, RAD)
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="currentColor" strokeWidth="1" className="text-black/10 dark:text-white/10" />
      })}
      {hasData && (
        <polygon
          points={dataPoly}
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="text-brand"
        />
      )}
      {list.map((p, i) => {
        const v = valueOf(p)
        if (v === null) return null
        const [x, y] = pt(i, (v / 10) * RAD)
        return <circle key={p.id} cx={x} cy={y} r="4" className={PILLAR_FILL[p.id] || 'fill-brand-text'} />
      })}
      {list.map((p, i) => {
        const [vx, vy] = pt(i, RAD)
        const c = Math.cos(angle(i)), s = Math.sin(angle(i))
        const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
        const x = vx + c * 12
        const y = vy + s * 12 + (s < -0.3 ? 0 : s > 0.3 ? 0 : 3.5) + (s < -0.3 ? -2 : s > 0.3 ? 8 : 0)
        const v = valueOf(p)
        return (
          <text key={p.id} x={x} y={y} textAnchor={anchor} fontSize="11" fontWeight="800" fill="currentColor" className="text-theme">
            {PILLAR_SHORT[p.id] || p.id}{' '}
            <tspan fontWeight="900" fill="currentColor" className="text-brand-text">{v ?? '—'}</tspan>
          </text>
        )
      })}
    </svg>
  )
}

const SCORE_BANDS = [
  { label: 'Excellent', range: '9-10', cls: 'bg-emerald-500' },
  { label: 'Strong', range: '7-8', cls: 'bg-brand' },
  { label: 'Developing', range: '4-6', cls: 'bg-amber-500' },
  { label: 'Needs work', range: '1-3', cls: 'bg-rose-500' },
]

function ReportAnalytics({ values, grouped, pillars }) {
  const rows = []
  for (const g of grouped || []) {
    for (const sec of g.sections) {
      for (const t of sec.items) {
        const s = lensValue((values || {})[t.id])
        if (s !== null) rows.push({ id: t.id, name: t.name, pillar: g.pillar, score: s })
      }
    }
  }
  if (!rows.length) return null
  const overall = round1(rows.reduce((sum, r) => sum + r.score, 0) / rows.length)
  const byPillar = {}
  for (const r of rows) {
    if (!byPillar[r.pillar]) byPillar[r.pillar] = []
    byPillar[r.pillar].push(r.score)
  }
  const pillarAverages = {}
  for (const p of pillars || []) {
    const arr = byPillar[p.id]
    pillarAverages[p.id] = arr && arr.length ? round1(arr.reduce((s, n) => s + n, 0) / arr.length) : null
  }
  const counts = [0, 0, 0, 0]
  for (const r of rows) counts[r.score >= 9 ? 0 : r.score >= 7 ? 1 : r.score >= 4 ? 2 : 3]++
  const sorted = [...rows].sort((a, b) => b.score - a.score)
  const strongest = sorted.slice(0, 3)
  const focus = rows.length >= 6 ? sorted.slice(-3).reverse() : []
  const total = rows.length
  return (
    <div className="rounded-2xl border border-theme bg-white/60 dark:bg-slate-900/50 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-theme flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-brand-text" /> Report analytics
        </h4>
        <span className="text-[10px] font-bold text-muted">{total} skills scored</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
        <div className="flex flex-col items-center gap-2">
          <ScoreRing value={overall} size={96} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Overall score</span>
        </div>
        <div className="flex flex-col items-center gap-1 sm:col-span-2 lg:col-span-1">
          <PillarRadar averages={pillarAverages} pillars={pillars} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Pillar profile · 0-10</span>
        </div>
        <div className="space-y-2 w-full sm:col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Score distribution</span>
          {SCORE_BANDS.map((b, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-theme">{b.label} <span className="text-muted font-semibold">{b.range}</span></span>
                  <span className="font-heading font-black text-theme">{counts[i]} <span className="text-muted text-[10px] font-bold">{pct}%</span></span>
                </div>
                <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${b.cls} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {strongest.length > 0 && focus.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-theme">
          {[
            { title: 'Strongest skills', list: strongest },
            { title: 'Focus areas', list: focus },
          ].map(col => (
            <div key={col.title} className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{col.title}</span>
              {col.list.map(it => (
                <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg border border-theme bg-white/50 dark:bg-slate-900/40 px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-theme truncate">{it.name}</span>
                  <ScoreBadge value={it.score} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
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

function ScoreInput({ value, onChange, disabled, field }) {
  const n = scoreOf(value)
  const bump = (delta) => {
    const base = n ?? 0
    onChange(Math.min(10, Math.max(1, base + delta)))
  }
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return
    const root = e.currentTarget.closest('[data-skills]')
    if (!root) return
    const inputs = [...root.querySelectorAll('input[data-score-input]')].filter(el => el.offsetParent !== null)
    const next = inputs[inputs.indexOf(e.currentTarget) + 1]
    if (next) { e.preventDefault(); next.focus(); next.select() }
  }
  return (
    <span className="flex w-full items-center gap-1">
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || n === null || n <= 1}
        aria-label="Decrease score"
        className="sm:hidden shrink-0 min-w-[42px] min-h-[42px] rounded-lg bg-white dark:bg-slate-900 border border-theme text-theme disabled:opacity-40"
      >
        <Minus className="w-4 h-4 mx-auto" />
      </button>
      <input
        type="number"
        min="1"
        max="10"
        step="1"
        disabled={disabled}
        data-score-input=""
        data-field={field}
        value={n === null ? '' : n}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') { onChange(null); return }
          const num = parseInt(raw, 10)
          if (Number.isNaN(num)) return
          onChange(Math.min(10, Math.max(1, num)))
        }}
        onKeyDown={onKeyDown}
        className="flex-1 min-w-0 px-1 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-theme text-theme text-xs font-black text-center focus:border-brand-text focus:outline-none disabled:opacity-50"
        aria-label="Score out of 10"
      />
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled || (n !== null && n >= 10)}
        aria-label="Increase score"
        className="sm:hidden shrink-0 min-w-[42px] min-h-[42px] rounded-lg bg-white dark:bg-slate-900 border border-theme text-theme disabled:opacity-40"
      >
        <Plus className="w-4 h-4 mx-auto" />
      </button>
    </span>
  )
}

// Dense skills table (R1): collapsible pillar blocks with sticky headers + live
// counters, compact desktop rows, mobile stepper cards, Enter → next input.
//   mode 'user'  → user_score + user_comment
//   mode 'admin' → admin_score + final_score + admin_comment
//   mode 'view'  → read-only
const ROW_GRID = {
  user: 'grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] gap-x-3 gap-y-1 items-center',
  admin: 'grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_56px_72px_72px_minmax(0,1fr)] gap-x-3 gap-y-1 items-center',
  view: 'grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_72px] gap-x-3 gap-y-1 items-center',
}
const HEAD_GRID = {
  user: 'hidden sm:grid sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] gap-x-3 px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted',
  admin: 'hidden sm:grid sm:grid-cols-[minmax(0,1fr)_56px_72px_72px_minmax(0,1fr)] gap-x-3 px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted',
  view: 'hidden sm:grid sm:grid-cols-[minmax(0,1fr)_72px] gap-x-3 px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted',
}
const HEAD_LABELS = {
  user: ['Skill', 'Your score', 'Comment'],
  admin: ['Skill', 'Player', 'Admin', 'Final', 'Note'],
  view: ['Skill', 'Score'],
}
const HEAD_ALIGN = {
  user: ['', 'text-center', ''],
  admin: ['', 'text-center', 'text-center', 'text-center', ''],
  view: ['', 'text-right'],
}
const ROW_CLS = 'px-2 py-1.5 border-b border-black/5 dark:border-white/[0.06]'

function SkillsList({ grouped, pillars, values, mode, onChange, showUserComments, showAdminComments, tableId }) {
  const pillarLabel = (p) => pillars?.find(x => x.id === p)?.label || PILLAR_FALLBACK[p] || `Pillar ${p}`
  const [collapsed, setCollapsed] = useState(() => {
    const set = new Set()
    if (mode === 'view') return set
    for (const g of grouped) {
      const items = g.sections.flatMap(s => s.items)
      const done = items.every(t => {
        const v = values[t.id] || {}
        return mode === 'admin'
          ? scoreOf(v.admin_score) !== null && scoreOf(v.final_score) !== null
          : scoreOf(v.user_score) !== null
      })
      if (done) set.add(g.pillar)
    }
    return set
  })

  const togglePillar = (p) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(p)) next.delete(p); else next.add(p)
    return next
  })

  const pillarCounts = (items) => {
    const c = { user: 0, admin: 0, final: 0, total: items.length }
    for (const t of items) {
      const v = values[t.id] || {}
      if (scoreOf(v.user_score) !== null) c.user++
      if (scoreOf(v.admin_score) !== null) c.admin++
      if (scoreOf(v.final_score) !== null) c.final++
    }
    return c
  }

  const nameCls = 'col-span-2 sm:col-span-1 min-w-0'
  const commentCls = 'col-span-2 sm:col-span-1 min-w-0'

  return (
    <div data-skills={tableId || mode} className="space-y-4">
      {mode === 'admin' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-muted">
          <span><span className="text-theme font-extrabold">Player</span> — self-assessment, read-only</span>
          <span><span className="text-theme font-extrabold">Admin</span> — your working score</span>
          <span><span className="text-brand-text font-extrabold">Final</span> — published score</span>
        </div>
      )}
      {grouped.map(g => {
        const allItems = g.sections.flatMap(s => s.items)
        const counts = pillarCounts(allItems)
        const isCollapsed = collapsed.has(g.pillar)
        const counter = mode === 'admin'
          ? `Admin ${counts.admin}/${counts.total} · Final ${counts.final}/${counts.total}`
          : mode === 'user'
            ? `${counts.user}/${counts.total} scored`
            : `${counts.total} skills`
        return (
          <section key={g.pillar} className="rounded-xl border border-theme bg-white/50 dark:bg-slate-900/40">
            <button
              type="button"
              onClick={() => togglePillar(g.pillar)}
              aria-expanded={!isCollapsed}
              className={`w-full sticky ${mode === 'admin' ? 'top-0' : 'top-20'} z-20 flex items-center gap-2 px-3 py-2.5 rounded-t-xl bg-white dark:bg-slate-900 border-b border-theme text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PILLAR_DOT[g.pillar] || 'bg-brand-text'}`} />
              <span className="text-xs font-extrabold uppercase tracking-wider text-theme truncate">
                Pillar {g.pillar}: {pillarLabel(g.pillar)}
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-bold text-muted">{counter}</span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-muted transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
            </button>
            {!isCollapsed && (
              <div className="pb-1">
                <div className={HEAD_GRID[mode]}>
                  {HEAD_LABELS[mode].map((l, i) => (
                    <span key={l} className={HEAD_ALIGN[mode][i] || ''}>{l}</span>
                  ))}
                </div>
                {g.sections.map(sec => (
                  <div key={sec.name}>
                    <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{sec.name}</p>
                    {sec.items.map(t => {
                      const v = values[t.id] || {}
                      const userComment = v.user_comment || ''
                      const adminComment = v.admin_comment || ''
                      if (mode === 'view') {
                        return (
                          <div key={t.id} className={`${ROW_GRID.view} ${ROW_CLS}`}>
                            <div className={nameCls}>
                              <span className="text-xs font-semibold text-theme block truncate" title={t.name}>{t.name}</span>
                              {showUserComments && userComment && (
                                <span className="block text-[11px] text-muted italic truncate" title={userComment}>Player: {userComment}</span>
                              )}
                              {showAdminComments && adminComment && (
                                <span className="block text-[11px] text-brand-text truncate" title={adminComment}>Coach: {adminComment}</span>
                              )}
                            </div>
                            <div className="justify-self-end">
                              <ScoreBadge value={scoreOf(v.final_score) ?? scoreOf(v.user_score) ?? scoreOf(v.admin_score)} />
                            </div>
                          </div>
                        )
                      }
                      if (mode === 'user') {
                        return (
                          <div key={t.id} className={`${ROW_GRID.user} ${ROW_CLS}`}>
                            <div className={nameCls}>
                              <span className="text-xs font-semibold text-theme block truncate" title={t.name}>{t.name}</span>
                            </div>
                            <div>
                              <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">Your score</span>
                              <ScoreInput value={scoreOf(v.user_score)} onChange={(n) => onChange(t.id, 'user_score', n)} field="user" />
                            </div>
                            <div className={commentCls}>
                              <input
                                type="text"
                                value={userComment}
                                maxLength={200}
                                onChange={(e) => onChange(t.id, 'user_comment', e.target.value)}
                                placeholder="Comment (optional)"
                                className="w-full min-h-[42px] sm:min-h-0 px-2 py-1.5 rounded-lg bg-surface border border-theme text-[11px] text-theme placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
                              />
                            </div>
                          </div>
                        )
                      }
                      // mode === 'admin'
                      return (
                        <div key={t.id} className={`${ROW_GRID.admin} ${ROW_CLS}`}>
                          <div className={nameCls}>
                            <span className="text-xs font-semibold text-theme block truncate" title={t.name}>{t.name}</span>
                            <span className="sm:hidden block text-[10px] font-bold text-muted truncate">
                              Player: {scoreOf(v.user_score) ?? '—'}{showUserComments && userComment ? ` · ${userComment}` : ''}
                            </span>
                            {showUserComments && userComment && (
                              <span className="hidden sm:block text-[10px] text-muted italic truncate" title={userComment}>Player: {userComment}</span>
                            )}
                          </div>
                          <div className="hidden sm:block text-center text-[10px] font-black text-muted" title="Player's own self-score">
                            {scoreOf(v.user_score) ?? '—'}
                          </div>
                          <div>
                            <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">Admin</span>
                            <ScoreInput value={scoreOf(v.admin_score)} onChange={(n) => onChange(t.id, 'admin_score', n)} field="admin" />
                          </div>
                          <div>
                            <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">Final</span>
                            <ScoreInput value={scoreOf(v.final_score)} onChange={(n) => onChange(t.id, 'final_score', n)} field="final" />
                          </div>
                          <div className={commentCls}>
                            <input
                              type="text"
                              value={adminComment}
                              maxLength={200}
                              onChange={(e) => onChange(t.id, 'admin_comment', e.target.value)}
                              placeholder="Coach note (optional)"
                              className="w-full min-h-[42px] sm:min-h-0 px-2 py-1.5 rounded-lg bg-surface border border-theme text-[11px] text-theme placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
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
    <details className="group rounded-2xl border border-theme bg-white/60 dark:bg-slate-900/50">
      <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-muted hover:text-theme transition-colors [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" /> Journey history ({timeline.length})
        </span>
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
      </summary>
      <ol className="space-y-2 border-l-2 border-theme ml-4 pl-4 pb-4 pr-4">
        {timeline.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full ${e.status === 'published' ? 'bg-emerald-400' : e.status === 'returned' ? 'bg-rose-400' : 'bg-brand-text'}`} />
            <p className="text-xs font-semibold text-theme">{e.label}</p>
            <p className="text-[10px] text-muted">{formatDateMed(e.date)}</p>
          </li>
        ))}
      </ol>
    </details>
  )
}

function EmptyJourney({ summary, onStart, busy }) {
  return (
    <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-theme bg-white/50 dark:bg-slate-900/40">
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
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all">
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
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const [view, setView] = useState('main') // main | assessment | report:<id>
  const [openId, setOpenId] = useState(null)

  const grouped = useGroupedTemplates(data?.templates)
  const values = useMemo(() => (data?.assessment ? valuesFromItems(data.assessment.items) : {}), [data])
  const [draft, setDraft] = useState({})
  const [generalComment, setGeneralComment] = useState('')

  const load = useCallback(() => {
    return api.get('/journey').then((d) => {
      setError(null)
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
      setError(err)
      toast.error(err.message || 'Failed to load your journey')
      throw err
    })
  }, [toast])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const retry = () => {
    setError(null)
    setLoading(true)
    load().finally(() => setLoading(false))
  }

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

  if (loading) return <SkeletonPanel />
  if (error && !data) return <ErrorPanel message={error.message} onRetry={retry} />
  if (!data) return null

  const { summary, pillars } = data
  const assessment = data.assessment
  const assessScored = Object.values(values).filter(v => scoreOf(v.user_score) !== null).length
  const assessEditable = !!assessment && ['draft', 'returned'].includes(assessment.status)
  const trend = trendPoints(data)

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

        <ReportAnalytics
          values={editable ? { ...values, ...draft } : values}
          grouped={grouped}
          pillars={pillars}
        />

        <SkillsList
          grouped={grouped}
          pillars={pillars}
          values={editable ? { ...values, ...draft } : values}
          mode={editable ? 'user' : 'view'}
          onChange={setField}
          showUserComments
          tableId="assessment"
        />

        {editable && (
          <div className="sticky bottom-0 z-30 -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 px-6 sm:px-8 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-theme rounded-b-3xl flex flex-wrap gap-3 items-center">
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
            <span className="text-[11px] text-muted font-semibold">{scored}/33 scored — all 33 required to submit</span>
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
          <ReportAnalytics
            values={editable ? { ...valuesFromItems(report.items), ...draft } : valuesFromItems(report.items)}
            grouped={grouped}
            pillars={pillars}
          />
          <SkillsList
            grouped={grouped}
            pillars={pillars}
            values={editable ? { ...valuesFromItems(report.items), ...draft } : valuesFromItems(report.items)}
            mode={editable ? 'user' : 'view'}
            onChange={setField}
            showUserComments
            showAdminComments
            tableId={`report-${report.id}`}
          />
          {editable && (
            <div className="sticky bottom-0 z-30 -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 px-6 sm:px-8 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-theme rounded-b-3xl flex flex-wrap gap-3 items-center">
              <button
                onClick={() => resubmitReport(report.id)}
                disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-60"
              >
                <Send className="w-4 h-4" /> {busy === `submit-${report.id}` ? 'Submitting…' : 'Resubmit for review'}
              </button>
              <span className="text-[11px] text-muted font-semibold">{scored}/33 self-scores set — all 33 required</span>
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

      {/* Hero: score ring + current status + primary CTA (R2/R4) */}
      <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-theme bg-white/60 dark:bg-slate-900/50 p-5">
        <ScoreRing value={summary.overall_score} size={92} />
        <div className="flex-1 w-full min-w-0 flex flex-col items-center sm:items-start gap-2.5 text-center sm:text-left">
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            <span className="font-heading text-lg font-black text-theme">
              Report {summary.report_position ?? 0} of {summary.max_reports ?? 10}
            </span>
            {summary.active_report
              ? <StatusPill status={summary.active_report.status} label={summary.active_report.status_label} />
              : assessment && <StatusPill status={assessment.status} label={assessment.status_label} />}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {assessEditable
              ? `Your initial assessment is ${assessment.status === 'returned' ? 'returned for changes' : 'in progress'} — ${assessScored}/33 skills scored.`
              : summary.journey_complete
                ? 'All reports in this journey are published.'
                : 'Your coach scores every skill from 1 to 10 in each monthly report.'}
          </p>
          {assessEditable && (
            <button
              onClick={() => setView('assessment')}
              disabled={busy !== ''}
              className="mt-0.5 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm inline-flex items-center gap-2 transition-all disabled:opacity-60"
            >
              <Rocket className="w-4 h-4" />
              {assessScored >= 33 ? `Review & submit (${assessScored}/33)` : `Continue scoring (${assessScored}/33)`}
            </button>
          )}
        </div>
      </div>

      <SummaryCards summary={summary} />
      <PillarRow pillarAverages={summary.pillar_averages} pillars={pillars} />
      <TrendPanel points={trend} />

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
                <span className="text-[10px] font-black text-theme hidden md:inline">· {assessment.overall_score ?? '—'}/10</span>
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
                      <span className="text-[10px] font-black text-theme hidden md:inline">· {r.overall_score ?? '—'}/10</span>
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
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const [openId, setOpenId] = useState(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const [adminValues, setAdminValues] = useState({})
  const [assessmentValues, setAssessmentValues] = useState({})

  const grouped = useGroupedTemplates(data?.templates)

  const load = useCallback(() => {
    return api.get(`/journey/${userId}`).then((d) => {
      setError(null)
      setData(d)
      const active = d.summary.active_report
      const latest = [...d.reports].reverse().find(r => r.status === 'published')
      setOpenId(active?.id ?? latest?.id ?? null)
      const activeReport = d.reports.find(r => r.id === (active?.id ?? -1))
      setAdminValues(valuesFromItems(activeReport?.items ?? latest?.items ?? []))
      setAssessmentValues(valuesFromItems(d.assessment?.items ?? []))
      return d
    }).catch((err) => {
      setError(err)
      toast.error(err.message || 'Failed to load journey')
      throw err
    })
  }, [userId, toast])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const retry = () => {
    setError(null)
    setLoading(true)
    load().finally(() => setLoading(false))
  }

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

  const fillFinalsFromAdmin = (tableId) => {
    setAdminValues(prev => {
      const out = { ...prev }
      for (const [k, v] of Object.entries(out)) {
        if (k === '__general') continue
        if (scoreOf(v.admin_score) !== null && scoreOf(v.final_score) === null) out[k] = { ...v, final_score: v.admin_score }
      }
      return out
    })
    toast.info('Final scores filled from admin scores where empty — review, then save')
    focusFirstEmptyFinal(tableId)
  }

  if (loading) return <SkeletonPanel />
  if (error && !data) return <ErrorPanel message={error.message} onRetry={retry} />
  if (!data) return null

  const { summary, pillars, assessment } = data
  const trend = trendPoints(data)

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
      const missing = Object.entries(values).filter(
        ([k, v]) => k !== '__general' && (scoreOf(v.admin_score) === null || scoreOf(v.final_score) === null)
      ).length
      return (
        <>
          <ActionButton busy={busyKey('return')} onClick={() => returnReport(report)} icon={RotateCcw} label="Return for changes" tone="rose" />
          <ActionButton
            busy={busyKey('reviewed')}
            onClick={() => action(report.id, 'reviewed')}
            icon={CheckCircle2}
            label="Mark reviewed"
            disabled={missing > 0}
            title={missing > 0 ? `${missing} skill${missing === 1 ? '' : 's'} still need an admin + final score` : ''}
          />
        </>
      )
    }
    if (report.status === 'reviewed') {
      return <ActionButton busy={busyKey('publish')} onClick={() => action(report.id, 'publish')} icon={CheckCircle2} label="Publish" />
    }
    return null
  }

  // Finals that can be filled right now: admin score set, final still empty (R3).
  const emptyFinals = (values) =>
    Object.entries(values).filter(([k, v]) => k !== '__general' && scoreOf(v.admin_score) !== null && scoreOf(v.final_score) === null).length
  const assessEmptyFinals = emptyFinals(assessmentValues)
  const reportEmptyFinals = emptyFinals(adminValues)

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
        <TrendPanel points={trend} />

        {/* create next monthly report */}
        <div className="rounded-xl border border-theme bg-white/50 dark:bg-slate-900/40 p-4 flex flex-wrap items-end gap-3">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Baseline · 33 skills</span>
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
          <ReportAnalytics
            values={{ ...valuesFromItems(assessment.items), ...assessmentValues }}
            grouped={grouped}
            pillars={pillars}
          />
          <SkillsList
            grouped={grouped}
            pillars={pillars}
            values={{ ...valuesFromItems(assessment.items), ...assessmentValues }}
            mode="admin"
            onChange={setAssessmentField}
            showUserComments
            tableId="assessment"
          />
          {/* Sticky action bar (R3): works + status actions always reachable */}
          <div className="sticky bottom-0 z-30 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-theme rounded-b-2xl flex flex-wrap gap-2 items-center">
            <ActionButton
              busy={busy === `save-${assessment.id}`}
              onClick={() => saveReport(assessment.id, stripGeneral(assessmentValues), assessmentValues.__general ?? assessment.general_admin_comment ?? '')}
              icon={Save}
              label="Save scores"
            />
            <ActionButton
              busy={false}
              onClick={() => fillFinalsFromAdmin('assessment')}
              icon={Target}
              label={`Fill finals (${assessEmptyFinals} empty)`}
              tone="ghost"
              disabled={assessEmptyFinals === 0}
              title={assessEmptyFinals === 0 ? 'No finals to fill — every admin score already has a final' : ''}
            />
            <span className="flex-1" />
            {renderActions(assessment, assessmentValues)}
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
          <div key={r.id} className="glass-panel rounded-2xl border border-theme">
            <button
              type="button"
              onClick={() => {
                if (openId === r.id) { setOpenId(null); return }
                setOpenId(r.id)
                // Load THIS report's saved numbers (adminValues was holding the active report's values)
                setAdminValues(valuesFromItems(r.items ?? []))
              }}
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-all"
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
                <ReportAnalytics
                  values={{ ...valuesFromItems(r.items), ...adminValues }}
                  grouped={grouped}
                  pillars={pillars}
                />
                <SkillsList
                  grouped={grouped}
                  pillars={pillars}
                  values={{ ...valuesFromItems(r.items), ...adminValues }}
                  mode="admin"
                  onChange={setAdminField}
                  showUserComments
                  tableId={`report-${r.id}`}
                />
                {/* Sticky action bar (R3) */}
                <div className="sticky bottom-0 z-30 -mx-5 -mb-5 px-5 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-theme rounded-b-2xl flex flex-wrap gap-2 items-center">
                  <ActionButton
                    busy={busy === `save-${r.id}`}
                    onClick={() => saveReport(r.id, stripGeneral(adminValues), adminValues.__general ?? r.general_admin_comment ?? '')}
                    icon={Save}
                    label="Save report"
                  />
                  <ActionButton
                    busy={false}
                    onClick={() => fillFinalsFromAdmin(`report-${r.id}`)}
                    icon={Target}
                    label={`Fill finals (${reportEmptyFinals} empty)`}
                    tone="ghost"
                    disabled={reportEmptyFinals === 0}
                    title={reportEmptyFinals === 0 ? 'No finals to fill — every admin score already has a final' : ''}
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
    ghost: 'bg-white dark:bg-slate-900 border border-theme text-theme hover:bg-slate-100/70 dark:hover:bg-slate-800/70',
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
