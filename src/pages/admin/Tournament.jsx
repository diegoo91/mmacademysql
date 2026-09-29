import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import PlayerSearchInput from '../../components/PlayerSearchInput'
import TournamentCountdown from '../../components/TournamentCountdown'
import BracketView from '../../components/BracketView'
import GroupStandings from '../../components/GroupStandings'
import {
  SKILL_LEVELS, BRACKET_SIZES, FORMATS, MATCH_FORMATS, SIGNUP_STATUS, PAYMENT_STATUS, STATUS,
  toApiDateTime, toInputValue, fmtDateTime, signupCap, formatLabel, matchFormatLabel,
  formatSummary, statusPill,
} from '../../lib/tournament'
import {
  Plus, X, ArrowLeft, RefreshCw, ChevronUp, ChevronDown, Check, AlertTriangle,
  Users, Settings, Target, Medal, Trash2, Edit, Save, Zap, DollarSign,
} from 'lucide-react'

const GROUP_LABELS = 'ABCDEFGH'
const TABS = [
  { id: 'overview', label: 'Overview', icon: Settings },
  { id: 'signups', label: 'Signups & Teams', icon: Users },
  { id: 'draw', label: 'Draw', icon: Target },
  { id: 'matches', label: 'Matches', icon: Medal },
]

const EMPTY_FORM = {
  name: '', skill_level: 'Open', format: 'knockout', match_format: 'short',
  bracket_size: '16', groups_count: '2', teams_per_group: '4', advance_per_group: '2',
  entry_fee: '0', count_to_records: false,
  registration_open_at: '', registration_close_at: '', notes: '',
}

function validateForm(f) {
  if (!f.name.trim()) return 'Name is required'
  if (!SKILL_LEVELS.includes(f.skill_level)) return 'Pick a skill level'
  if (!FORMATS.some((x) => x.value === f.format)) return 'Pick a format'
  if (!MATCH_FORMATS.some((x) => x.value === f.match_format)) return 'Pick a match format'
  const fee = Number(f.entry_fee)
  if (!Number.isFinite(fee) || fee < 0) return 'Entry fee must be 0 or more'
  if (f.registration_open_at && f.registration_close_at) {
    const o = new Date(f.registration_open_at)
    const c = new Date(f.registration_close_at)
    if (!Number.isNaN(o.getTime()) && !Number.isNaN(c.getTime()) && o >= c) return 'Close date must be after open date'
  }
  if (f.format === 'knockout') {
    if (!BRACKET_SIZES.includes(Number(f.bracket_size))) return `Bracket size must be one of: ${BRACKET_SIZES.join(', ')}`
    return null
  }
  const g = Number(f.groups_count)
  const tpg = Number(f.teams_per_group)
  const adv = Number(f.advance_per_group)
  if (!Number.isInteger(g) || g < 2) return 'Groups must be 2 or more'
  if (!Number.isInteger(tpg) || tpg < 2) return 'Teams per group must be 2 or more'
  if (adv < 1 || adv > tpg) return 'Advance must be between 1 and teams per group'
  if (!BRACKET_SIZES.includes(g * tpg)) return `Groups × teams must be one of: ${BRACKET_SIZES.join(', ')} (got ${g * tpg})`
  if (!BRACKET_SIZES.includes(g * adv)) return `Groups × advance must be one of: ${BRACKET_SIZES.join(', ')} (got ${g * adv})`
  return null
}

function toPayload(f) {
  const groups = f.format === 'groups_knockout'
  return {
    name: f.name.trim(),
    skill_level: f.skill_level,
    format: f.format,
    match_format: f.match_format,
    bracket_size: groups ? undefined : Number(f.bracket_size),
    groups_count: groups ? Number(f.groups_count) : undefined,
    teams_per_group: groups ? Number(f.teams_per_group) : undefined,
    advance_per_group: groups ? Number(f.advance_per_group) : undefined,
    entry_fee: Number(f.entry_fee),
    count_to_records: f.count_to_records,
    registration_open_at: toApiDateTime(f.registration_open_at),
    registration_close_at: toApiDateTime(f.registration_close_at),
    notes: f.notes,
  }
}

function Badge({ value, map }) {
  const s = map[value] || { label: value || '—', cls: 'bg-slate-400/15 text-muted border-theme' }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

function Fact({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm font-semibold text-theme">{value}</div>
    </div>
  )
}

function TournamentFormModal({ initial, submitting, onCancel, onSubmit }) {
  const [f, setF] = useState(() => initial ? {
    name: initial.name || '',
    skill_level: initial.skill_level || 'Open',
    format: initial.format || 'knockout',
    match_format: initial.match_format || 'short',
    bracket_size: String(initial.bracket_size || 16),
    groups_count: String(initial.groups_count || 2),
    teams_per_group: String(initial.teams_per_group || 4),
    advance_per_group: String(initial.advance_per_group || 2),
    entry_fee: String(initial.entry_fee ?? 0),
    count_to_records: Number(initial.count_to_records) === 1,
    registration_open_at: toInputValue(initial.registration_open_at),
    registration_close_at: toInputValue(initial.registration_close_at),
    notes: initial.notes || '',
  } : { ...EMPTY_FORM })
  const [err, setErr] = useState('')
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const groups = f.format === 'groups_knockout'
  const g = Number(f.groups_count) || 0
  const tpg = Number(f.teams_per_group) || 0
  const adv = Number(f.advance_per_group) || 0
  const capOk = groups ? BRACKET_SIZES.includes(g * tpg) : BRACKET_SIZES.includes(Number(f.bracket_size))
  const bracketOk = groups ? BRACKET_SIZES.includes(g * adv) : capOk

  const submit = (e) => {
    e.preventDefault()
    const v = validateForm(f)
    if (v) { setErr(v); return }
    setErr('')
    onSubmit(f)
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text'
  const labelCls = 'block text-xs font-semibold text-muted mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <form onSubmit={submit} className="w-full max-w-2xl glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto space-y-4 animate-fadeIn">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-extrabold text-theme">{initial ? 'Edit tournament' : 'New tournament'}</h2>
          <button type="button" onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-muted"><X className="w-4 h-4" /></button>
        </div>

        {err && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. September Open Cup" />
          </div>
          <div>
            <label className={labelCls}>Skill level *</label>
            <select className={inputCls} value={f.skill_level} onChange={(e) => set('skill_level', e.target.value)}>
              {SKILL_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Match format *</label>
            <select className={inputCls} value={f.match_format} onChange={(e) => set('match_format', e.target.value)}>
              {MATCH_FORMATS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Format *</label>
            <div className="flex gap-2">
              {FORMATS.map((x) => (
                <button key={x.value} type="button" onClick={() => set('format', x.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                    f.format === x.value ? 'bg-brand text-white border-brand-text' : 'bg-surface border-theme text-theme hover:border-brand-text'}`}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          {!groups ? (
            <div>
              <label className={labelCls}>Bracket size *</label>
              <select className={inputCls} value={f.bracket_size} onChange={(e) => set('bracket_size', e.target.value)}>
                {BRACKET_SIZES.map((s) => <option key={s} value={s}>{s} teams</option>)}
              </select>
              <p className={`text-[11px] mt-1 ${capOk ? 'text-muted' : 'text-rose-400'}`}>Sign-up cap: {f.bracket_size} teams</p>
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Groups *</label>
                <input type="number" min="2" className={inputCls} value={f.groups_count} onChange={(e) => set('groups_count', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Teams per group *</label>
                <input type="number" min="2" className={inputCls} value={f.teams_per_group} onChange={(e) => set('teams_per_group', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Advance per group *</label>
                <input type="number" min="1" className={inputCls} value={f.advance_per_group} onChange={(e) => set('advance_per_group', e.target.value)} />
              </div>
              <div className="flex items-end">
                <p className={`text-[11px] pb-2 ${capOk ? 'text-muted' : 'text-rose-400'}`}>
                  {capOk ? `Sign-up cap: ${g * tpg} teams` : `Groups × teams = ${g * tpg} — must be ${BRACKET_SIZES.join('/')}`}
                  <br />
                  <span className={bracketOk ? 'text-muted' : 'text-rose-400'}>
                    {bracketOk ? `Knockout bracket: ${g * adv}` : `Groups × advance = ${g * adv} — must be ${BRACKET_SIZES.join('/')}`}
                  </span>
                </p>
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>Entry fee (EGP) *</label>
            <input type="number" min="0" step="1" className={inputCls} value={f.entry_fee} onChange={(e) => set('entry_fee', e.target.value)} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.count_to_records} onChange={(e) => set('count_to_records', e.target.checked)} className="w-4 h-4 accent-[var(--color-brand)]" />
              <span className="text-xs font-semibold text-theme">Count results to player records</span>
            </label>
          </div>
          <div>
            <label className={labelCls}>Registration opens (local time)</label>
            <input type="datetime-local" className={inputCls} value={f.registration_open_at} onChange={(e) => set('registration_open_at', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Registration closes (local time)</label>
            <input type="datetime-local" className={inputCls} value={f.registration_close_at} onChange={(e) => set('registration_close_at', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes (public)</label>
            <textarea rows="2" className={`${inputCls} resize-none`} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Venue, prize info, schedule…" />
          </div>
          <p className="sm:col-span-2 text-[11px] text-muted">
            Both dates set → tournament opens immediately. Leave empty → saved as a draft you can open later.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
            {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create tournament'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ScoreInputs({ value, onChange, onSave, saving, disabled, compact }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}>
      <input type="number" min="0" disabled={disabled} value={value.a}
        onChange={(e) => onChange({ ...value, a: e.target.value })}
        className="w-14 px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs text-center tabular-nums disabled:opacity-50" />
      <span className="text-muted text-xs font-bold">–</span>
      <input type="number" min="0" disabled={disabled} value={value.b}
        onChange={(e) => onChange({ ...value, b: e.target.value })}
        className="w-14 px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs text-center tabular-nums disabled:opacity-50" />
      <input type="number" min="1" disabled={disabled} placeholder="Crt" value={value.court}
        onChange={(e) => onChange({ ...value, court: e.target.value })}
        className="w-14 px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs text-center tabular-nums disabled:opacity-50" />
      <button onClick={onSave} disabled={saving || disabled}
        className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1">
        <Save className="w-3 h-3" /> {saving ? '…' : 'Save'}
      </button>
    </div>
  )
}

export default function AdminTournament() {
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [signupsData, setSignupsData] = useState(null)
  const [usersById, setUsersById] = useState(new Map())
  const [banner, setBanner] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)

  // signups / teams tab state
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')
  const [pairName, setPairName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamP1, setTeamP1] = useState(null)
  const [teamP2, setTeamP2] = useState(null)
  const [editTeamId, setEditTeamId] = useState(null)
  const [editTeamName, setEditTeamName] = useState('')

  // draw state
  const [order, setOrder] = useState([])
  const [groupAssign, setGroupAssign] = useState({})
  const [drawMode, setDrawMode] = useState('order')

  // match score state
  const [scores, setScores] = useState({})
  const [savingMatch, setSavingMatch] = useState(null)

  const say = (type, text) => setBanner({ type, text })

  const fetchList = useCallback(async () => {
    setListLoading(true)
    try {
      const data = await api.get('/tournaments/manage')
      setList(data.tournaments || [])
    } catch (err) {
      say('err', err.message || 'Failed to load tournaments')
    } finally {
      setListLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async () => {
    if (selectedId == null) return
    try {
      const data = await api.get(`/tournaments/${selectedId}`)
      setDetail(data)
      const next = {}
      for (const m of data.matches || []) {
        next[m.id] = {
          a: m.score_a ?? '',
          b: m.score_b ?? '',
          court: m.court ?? '',
        }
      }
      setScores(next)
    } catch (err) {
      say('err', err.message || 'Failed to load tournament')
    }
  }, [selectedId])

  const fetchSignups = useCallback(async () => {
    if (selectedId == null) return
    try {
      const data = await api.get(`/tournaments/${selectedId}/signups`)
      setSignupsData(data)
    } catch (err) {
      say('err', err.message || 'Failed to load signups')
    }
  }, [selectedId])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users')
      const arr = Array.isArray(res) ? res : (res.users || res.players || [])
      setUsersById(new Map(arr.map((u) => [u.id, u.name || u.full_name])))
    } catch { /* players list optional — names fall back to ids */ }
  }, [])

  const reload = useCallback(() => {
    fetchList()
    fetchDetail()
    fetchSignups()
  }, [fetchList, fetchDetail, fetchSignups])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => {
    setDetail(null)
    setPairA(''); setPairB(''); setPairName('')
    setTeamP1(null); setTeamP2(null); setTeamName('')
    setEditTeamId(null); setDrawMode('order')
    if (selectedId != null) {
      setBanner(null)
      setSignupsData(null)
      fetchDetail()
      fetchSignups()
      fetchUsers()
    }
  }, [selectedId, fetchDetail, fetchSignups, fetchUsers])

  const t = detail?.tournament || null
  const teams = detail?.teams || []
  const matches = detail?.matches || []
  const knockout = detail?.knockout || []
  const signups = signupsData?.signups || []
  const entryFee = Number(signupsData?.entry_fee ?? t?.entry_fee ?? 0)
  const cap = t ? signupCap(t) : 0
  const hasDraw = matches.length > 0
  const nameOf = (id) => (id == null ? null : (usersById.get(id) || `Player #${id}`))

  // roster preview for pre-draw ordering (uniform player1 ids — works for
  // both admin-created teams and signups materialized during the draw)
  const rosterPreview = () => {
    const entries = []
    const seen = new Set()
    for (const tm of teams) {
      entries.push({ playerId: tm.player1_id, label: tm.team_name })
      seen.add(tm.player1_id)
    }
    for (const s of signups) {
      if (s.status !== 'approved' || !s.player2_id) continue
      if (seen.has(s.player1_id)) continue
      entries.push({ playerId: s.player1_id, label: s.team_name || `${s.player1_name} & ${s.player2_name}` })
      seen.add(s.player1_id)
    }
    return entries
  }

  useEffect(() => {
    const ids = rosterPreview().map((e) => e.playerId)
    setOrder((prev) => {
      if (!prev.length) return ids
      const kept = prev.filter((id) => ids.includes(id))
      const missing = ids.filter((id) => !kept.includes(id))
      return [...kept, ...missing]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupsData, detail])

  const rosterNames = () => {
    const byPlayer = new Map(rosterPreview().map((e) => [e.playerId, e.label]))
    return order.map((pid) => ({ playerId: pid, label: byPlayer.get(pid) || nameOf(pid) }))
  }

  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      const res = await fn()
      if (okMsg) say('ok', okMsg)
      reload()
      return res
    } catch (err) {
      say('err', err.message || 'Action failed')
      return null
    } finally {
      setBusy(false)
    }
  }

  const openForm = (target) => {
    setEditTarget(target || null)
    setFormOpen(true)
  }

  const submitForm = async (f) => {
    setSubmitting(true)
    try {
      const payload = toPayload(f)
      if (editTarget) {
        await api.put(`/tournaments/${editTarget.id}`, payload)
        say('ok', 'Tournament updated')
      } else {
        const res = await api.post('/tournaments', payload)
        say('ok', `Tournament "${res.tournament?.name || f.name}" created`)
      }
      setFormOpen(false)
      setEditTarget(null)
      fetchList()
    } catch (err) {
      say('err', err.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const closeRegistration = () => {
    if (!window.confirm(`Close registration for "${t.name}"? Players will no longer be able to sign up.`)) return
    run(() => api.post(`/tournaments/${t.id}/close`), 'Registration closed')
  }

  const openRegistration = () => {
    if (!t.registration_close_at) { say('err', 'Set a registration close date first (Edit)'); return }
    if (!window.confirm(`Open registration for "${t.name}"?`)) return
    run(() => api.post(`/tournaments/${t.id}/open`, {}), 'Registration opened')
  }

  const deleteTournament = () => {
    if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return
    setBusy(true)
    api.del(`/tournaments/${t.id}`)
      .then(() => {
        setBanner({ type: 'ok', text: 'Tournament deleted' })
        setSelectedId(null)
        fetchList()
      })
      .catch((err) => setBanner({ type: 'err', text: err.message || 'Failed to delete' }))
      .finally(() => setBusy(false))
  }

  const completeTournament = () => {
    if (!window.confirm(`Mark "${t.name}" as completed?`)) return
    run(async () => {
      const res = await api.post(`/tournaments/${t.id}/complete`)
      if (res.mirrored > 0) say('ok', `Tournament completed — ${res.mirrored} results mirrored to records`)
      else say('ok', 'Tournament completed')
    })
  }

  const toggleCount = async (enabled) => {
    setBusy(true)
    try {
      const res = await api.put(`/tournaments/${t.id}/count-to-records`, { enabled })
      if (enabled && res.mirrored > 0) say('ok', `Counting enabled — ${res.mirrored} results mirrored to records`)
      else say('ok', enabled ? 'Results will count to records' : 'Results will NOT count to records')
      reload()
    } catch (err) {
      say('err', err.message || 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  const signupAction = (sid, status) => {
    const labels = { approved: 'approve', rejected: 'reject', withdrawn: 'withdraw' }
    if (!window.confirm(`Confirm: ${labels[status]} this signup?`)) return
    run(() => api.put(`/tournaments/signups/${sid}`, { status }), `Signup ${status}`)
  }

  const pairSolos = () => {
    if (!pairA || !pairB || pairA === pairB) { say('err', 'Pick two different solo signups'); return }
    if (!window.confirm('Pair these two solo players into a team?')) return
    run(async () => {
      await api.post(`/tournaments/${t.id}/pair-solos`, {
        signup_a_id: Number(pairA),
        signup_b_id: Number(pairB),
        team_name: pairName || undefined,
      })
      setPairA(''); setPairB(''); setPairName('')
      say('ok', 'Players paired into a team')
    })
  }

  const addTeam = () => {
    if (!teamP1) { say('err', 'Pick the first player'); return }
    run(async () => {
      await api.post(`/tournaments/${t.id}/teams`, {
        player1_id: teamP1.id,
        player2_id: teamP2 && teamP2.id !== teamP1.id ? teamP2.id : undefined,
        team_name: teamName || undefined,
      })
      setTeamP1(null); setTeamP2(null); setTeamName('')
      say('ok', 'Team added')
    })
  }

  const saveTeamName = async (tid) => {
    try {
      await api.put(`/tournaments/teams/${tid}`, { team_name: editTeamName })
      setEditTeamId(null)
      say('ok', 'Team renamed')
      reload()
    } catch (err) {
      say('err', err.message || 'Failed to rename')
    }
  }

  const deleteTeam = (tid, label) => {
    if (!window.confirm(`Remove team "${label}"?`)) return
    run(() => api.del(`/tournaments/teams/${tid}`), 'Team removed')
  }

  const doDraw = (body, confirmMsg) => {
    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    api.post(`/tournaments/${t.id}/draw`, body)
      .then((res) => {
        say('ok', `Draw published — ${res.teams} teams, ${res.matches} matches`)
        setTab('matches')
        reload()
      })
      .catch((err) => say('err', err.message || 'Draw failed'))
      .finally(() => setBusy(false))
  }

  const saveMatch = async (m) => {
    const s = scores[m.id] || {}
    if (s.a === '' || s.b == null || s.b === '') { say('err', 'Enter both scores'); return }
    const sa = Number(s.a)
    const sb = Number(s.b)
    if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0 || sa === sb) {
      say('err', 'Scores must be whole numbers, 0 or more, and cannot be tied')
      return
    }
    setSavingMatch(m.id)
    try {
      const res = await api.put(`/tournaments/matches/${m.id}`, {
        score_a: sa,
        score_b: sb,
        court: s.court ? Number(s.court) : undefined,
      })
      let msg = `Saved ${sa}–${sb}`
      if (res.knockout_built) msg += ' — group stage complete, knockout bracket created!'
      if (res.tournament_completed) msg += ' — tournament completed!'
      if (res.mirrored > 0) msg += ` (${res.mirrored} results mirrored to records)`
      say('ok', msg)
      reload()
    } catch (err) {
      say('err', err.message || 'Failed to save result')
    } finally {
      setSavingMatch(null)
    }
  }

  // ── List view ──────────────────────────────────────────────────────────
  if (selectedId == null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-black text-theme">Tournaments</h1>
            <p className="text-muted text-sm mt-1">Create tournaments, manage signups, publish draws and record results.</p>
          </div>
          <button onClick={() => openForm(null)}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> New tournament
          </button>
        </div>

        {banner && (
          <div className={`p-3 rounded-lg text-sm border ${banner.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>{banner.text}</div>
        )}

        <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
          {listLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">No tournaments yet — create the first one.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-xs uppercase border-b border-theme">
                    <th className="text-left px-6 py-4 font-semibold">Name</th>
                    <th className="text-left px-4 py-4 font-semibold">Status</th>
                    <th className="text-left px-4 py-4 font-semibold">Format</th>
                    <th className="text-left px-4 py-4 font-semibold">Skill</th>
                    <th className="text-center px-4 py-4 font-semibold">Signups</th>
                    <th className="text-right px-4 py-4 font-semibold">Fee</th>
                    <th className="text-right px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme/60">
                  {list.map((row) => (
                    <tr key={row.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-theme font-semibold text-xs">{row.name}</td>
                      <td className="px-4 py-4"><Badge value={row.status} map={STATUS} /></td>
                      <td className="px-4 py-4 text-muted text-xs whitespace-nowrap">{formatSummary(row)}</td>
                      <td className="px-4 py-4 text-muted text-xs">{row.skill_level}</td>
                      <td className="px-4 py-4 text-center text-xs text-theme font-bold">{row.signup_count}/{signupCap(row)}</td>
                      <td className="px-4 py-4 text-right text-xs text-muted whitespace-nowrap">
                        {Number(row.entry_fee) > 0 ? `${row.entry_fee} EGP` : 'Free'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedId(row.id)}
                          className="px-3 py-1.5 rounded-lg bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-xs font-bold">
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {formOpen && (
          <TournamentFormModal initial={editTarget} submitting={submitting}
            onCancel={() => { setFormOpen(false); setEditTarget(null) }} onSubmit={submitForm} />
        )}
      </div>
    )
  }

  // ── Detail view ────────────────────────────────────────────────────────
  const pendingCount = signups.filter((s) => s.status === 'pending').length
  const soloSignups = signups.filter((s) => !s.player2_id && s.status !== 'rejected' && s.status !== 'withdrawn')
  const previewEntries = rosterPreview()
  const groupCount = Number(t?.groups_count) || 0
  const groupLabelList = GROUP_LABELS.slice(0, groupCount).split('')

  const editableMatch = (m) => {
    if (!t || t.status !== 'in_progress' || m.status === 'completed') return false
    if (m.phase === 'knockout') return !!m.playable
    return !!(m.team_a_id && m.team_b_id)
  }

  const matchTeamName = (m, side) => {
    const id = side === 'a' ? (m.phase === 'knockout' ? m.a : m.team_a_id) : (m.phase === 'knockout' ? m.b : m.team_b_id)
    if (id == null) return 'TBD'
    return teams.find((x) => x.id === id)?.team_name || `Team ${id}`
  }

  const groupMatches = matches.filter((m) => m.phase === 'group')
  const detailKnockout = knockout.length ? knockout : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)}
            className="p-2.5 rounded-xl bg-surface border border-theme text-theme hover:bg-slate-200 dark:hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-2xl md:text-3xl font-black text-theme">{t?.name || '…'}</h1>
              {t && <span className={statusPill(t.status)}>{t.status?.replace('_', ' ')}</span>}
            </div>
            {t && <p className="text-muted text-sm mt-0.5">{formatSummary(t)} · {formatLabel(t.format)} · {matchFormatLabel(t.match_format)}</p>}
          </div>
        </div>
        <button onClick={reload}
          className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg text-sm border flex items-start justify-between gap-3 ${
          banner.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {!detail ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme w-fit overflow-x-auto max-w-full">
            {TABS.map((x) => {
              const Icon = x.icon
              const active = tab === x.id
              return (
                <button key={x.id} onClick={() => setTab(x.id)}
                  className={`px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${
                    active ? 'bg-brand text-white shadow-md' : 'text-muted hover:text-theme'}`}>
                  <Icon className="w-3.5 h-3.5" /> {x.label}
                  {x.id === 'signups' && pendingCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-gold/20 text-gold text-[10px] font-extrabold">{pendingCount}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && t && (
            <div className="space-y-4">
              <div className="glass-panel rounded-2xl border border-theme p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
                <Fact label="Status" value={<span className={statusPill(t.status)}>{t.status?.replace('_', ' ')}</span>} />
                <Fact label="Sign-ups" value={`${detail.signup_count ?? signups.length} / ${cap} teams`} />
                <Fact label="Entry fee" value={Number(t.entry_fee) > 0 ? `${t.entry_fee} EGP` : 'Free'} />
                <Fact label="Results to records" value={Number(t.count_to_records) === 1 ? 'Yes' : 'No'} />
                <Fact label="Registration opens" value={fmtDateTime(t.registration_open_at)} />
                <Fact label="Registration closes" value={fmtDateTime(t.registration_close_at)} />
                <Fact label="Skill level" value={t.skill_level} />
                <Fact label="Created" value={fmtDateTime(t.created_at)} />
              </div>

              {t.status === 'registration_open' && (
                <div className="glass-panel rounded-2xl border border-theme px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <TournamentCountdown target={t.registration_close_at} label="Registration closes in" />
                  <span className="text-xs text-muted">Auto-closes at the deadline, or close it manually below.</span>
                </div>
              )}

              <div className="glass-panel rounded-2xl border border-theme p-6 space-y-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Actions</h3>
                <div className="flex flex-wrap gap-3">
                  {!hasDraw && t.status !== 'in_progress' && t.status !== 'completed' && (
                    <>
                      <button onClick={() => openForm(t)} disabled={busy}
                        className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50">
                        <Edit className="w-4 h-4" /> Edit details
                      </button>
                      {t.status !== 'registration_open' && (
                        <button onClick={openRegistration} disabled={busy}
                          className="px-4 py-2.5 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-sm font-bold disabled:opacity-50">
                          Open registration
                        </button>
                      )}
                      {t.status === 'registration_open' && (
                        <button onClick={closeRegistration} disabled={busy}
                          className="px-4 py-2.5 rounded-xl bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25 text-sm font-bold disabled:opacity-50">
                          Close registration now
                        </button>
                      )}
                    </>
                  )}
                  {t.status === 'registration_closed' && !hasDraw && (
                    <button onClick={completeTournament} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold disabled:opacity-50">
                      Mark completed (no draw)
                    </button>
                  )}
                  {Number(t.count_to_records) !== 1 ? (
                    <button onClick={() => toggleCount(true)} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-sm font-bold disabled:opacity-50">
                      Enable “count to records”
                    </button>
                  ) : (
                    <button onClick={() => toggleCount(false)} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold disabled:opacity-50">
                      Disable “count to records”
                    </button>
                  )}
                  {t.status !== 'in_progress' && t.status !== 'completed' && (
                    <button onClick={deleteTournament} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                </div>
                {hasDraw && (
                  <p className="text-xs text-muted">The draw exists — details and results are locked. Use the Matches tab.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Signups & Teams ── */}
          {tab === 'signups' && (
            <div className="space-y-4">
              {entryFee > 0 && (
                <div className="p-3 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 shrink-0" />
                  Entry fee is {entryFee} EGP — approve each player’s payment in the <strong>Payments</strong> tab before approving their signup.
                </div>
              )}

              <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
                <div className="px-6 py-4 border-b border-theme flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Sign-ups ({signups.length})</h3>
                  <span className="text-xs text-muted">{cap} team cap · {detail.signup_count ?? 0} active</span>
                </div>
                {signups.length === 0 ? (
                  <div className="text-center py-10 text-muted text-sm">No signups yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted text-[10px] uppercase border-b border-theme">
                          <th className="text-left px-6 py-3 font-semibold">Team / Players</th>
                          <th className="text-left px-3 py-3 font-semibold">Signup</th>
                          <th className="text-left px-3 py-3 font-semibold">Payment</th>
                          <th className="text-right px-6 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme/60">
                        {signups.map((s) => {
                          const payBlocked = entryFee > 0 && s.payment_status !== 'payment_approved'
                          return (
                            <tr key={s.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-6 py-3">
                                <div className="text-xs font-bold text-theme">{s.team_name || `${s.player1_name}${s.player2_name ? ` & ${s.player2_name}` : ''}`}</div>
                                <div className="text-[11px] text-muted">
                                  {s.player1_name}{s.player2_id ? ` + ${s.player2_name}` : ' (solo)'}
                                </div>
                              </td>
                              <td className="px-3 py-3"><Badge value={s.status} map={SIGNUP_STATUS} /></td>
                              <td className="px-3 py-3">
                                {entryFee > 0 ? <Badge value={s.payment_status} map={PAYMENT_STATUS} /> : <span className="text-[11px] text-muted">—</span>}
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  {s.status !== 'approved' && (
                                    <button onClick={() => signupAction(s.id, 'approved')} disabled={busy || (s.status === 'pending' && payBlocked)}
                                      title={payBlocked && s.status === 'pending' ? 'Approve the entry payment first' : undefined}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-400/10 text-emerald-500 dark:text-emerald-400 border border-emerald-400/30 text-[11px] font-bold disabled:opacity-40 flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Approve
                                    </button>
                                  )}
                                  {s.status === 'pending' && (
                                    <button onClick={() => signupAction(s.id, 'rejected')} disabled={busy}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-400/30 text-[11px] font-bold disabled:opacity-40 flex items-center gap-1">
                                      <X className="w-3 h-3" /> Reject
                                    </button>
                                  )}
                                  {s.status === 'approved' && (
                                    <button onClick={() => signupAction(s.id, 'withdrawn')} disabled={busy}
                                      className="px-2.5 py-1 rounded-lg bg-slate-400/10 text-muted border border-theme text-[11px] font-bold disabled:opacity-40">
                                      Withdraw
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-panel rounded-2xl border border-theme p-6 space-y-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted flex items-center gap-2">
                    <Users className="w-4 h-4" /> Pair solo players
                  </h3>
                  {soloSignups.length < 2 ? (
                    <p className="text-xs text-muted">
                      {soloSignups.length === 0 ? 'No unpaired solo signups.' : 'Only one solo signup — nothing to pair yet.'}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1">Player 1</label>
                          <select className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs" value={pairA} onChange={(e) => setPairA(e.target.value)}>
                            <option value="">Pick…</option>
                            {soloSignups.map((s) => <option key={s.id} value={s.id}>{s.player1_name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1">Player 2</label>
                          <select className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs" value={pairB} onChange={(e) => setPairB(e.target.value)}>
                            <option value="">Pick…</option>
                            {soloSignups.map((s) => <option key={s.id} value={s.id}>{s.player1_name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">Team name (optional)</label>
                        <input className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs"
                          value={pairName} onChange={(e) => setPairName(e.target.value)} placeholder="Left blank → “X & Y”" />
                      </div>
                      <button onClick={pairSolos} disabled={busy}
                        className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold disabled:opacity-50">
                        Pair into team
                      </button>
                      <p className="text-[11px] text-muted">All solos must be paired before the draw. Both entry payments (if any) must be approved.</p>
                    </div>
                  )}
                </div>

                <div className="glass-panel rounded-2xl border border-theme p-6 space-y-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add team manually
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Player 1 *</label>
                      <PlayerSearchInput strict value={teamP1?.full_name || ''} onChange={() => {}} onPlayerSelect={setTeamP1} placeholder="Search member…" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Player 2 (optional)</label>
                      <PlayerSearchInput strict value={teamP2?.full_name || ''} onChange={() => {}} onPlayerSelect={setTeamP2} placeholder="Search member…" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Team name (optional)</label>
                      <input className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs"
                        value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                    </div>
                    <button onClick={addTeam} disabled={busy}
                      className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold disabled:opacity-50">
                      Add team
                    </button>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
                <div className="px-6 py-4 border-b border-theme flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Teams ({teams.length})</h3>
                  <span className="text-xs text-muted">{hasDraw ? 'Locked — draw exists' : 'Editable until the draw'}</span>
                </div>
                {teams.length === 0 ? (
                  <div className="text-center py-8 text-muted text-sm">Teams are created from approved signups at draw time.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted text-[10px] uppercase border-b border-theme">
                          <th className="text-left px-6 py-3 font-semibold">Team</th>
                          <th className="text-left px-3 py-3 font-semibold">Players</th>
                          <th className="text-left px-3 py-3 font-semibold">Source</th>
                          <th className="text-right px-6 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme/60">
                        {teams.map((tm) => (
                          <tr key={tm.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-3 text-xs font-bold text-theme">
                              {editTeamId === tm.id ? (
                                <div className="flex items-center gap-2">
                                  <input className="px-2 py-1 rounded-lg bg-surface border border-theme text-theme text-xs" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} />
                                  <button onClick={() => saveTeamName(tm.id)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditTeamId(null)} className="p-1 text-muted hover:bg-slate-500/10 rounded"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : tm.team_name}
                            </td>
                            <td className="px-3 py-3 text-[11px] text-muted">
                              {nameOf(tm.player1_id)}{tm.player2_id ? ` & ${nameOf(tm.player2_id)}` : ''}
                            </td>
                            <td className="px-3 py-3 text-[11px] text-muted capitalize">{tm.source}</td>
                            <td className="px-6 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {!hasDraw && (
                                  <>
                                    <button onClick={() => { setEditTeamId(tm.id); setEditTeamName(tm.team_name) }}
                                      className="p-1.5 text-muted hover:bg-slate-500/10 rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteTeam(tm.id, tm.team_name)}
                                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Draw ── */}
          {tab === 'draw' && t && (
            hasDraw ? (
              <div className="glass-panel rounded-2xl border border-theme p-8 text-center space-y-3">
                <Check className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="text-theme font-bold text-sm">The draw has been published.</p>
                <button onClick={() => setTab('matches')} className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold">Go to Matches</button>
              </div>
            ) : (
              <div className="space-y-4">
                {t.status !== 'registration_closed' && (
                  <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 text-sm text-gold flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Registration must be closed before the draw.</span>
                    {t.status === 'registration_open' && (
                      <button onClick={closeRegistration} disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-gold text-slate-950 text-xs font-extrabold disabled:opacity-50">
                        Close registration now
                      </button>
                    )}
                  </div>
                )}
                {pendingCount > 0 && (
                  <div className="p-3 rounded-lg bg-sky-400/10 border border-sky-400/30 text-sky-500 dark:text-sky-400 text-xs">
                    {pendingCount} signup(s) still pending — only <strong>approved</strong> signups become teams. Review them in Signups &amp; Teams.
                  </div>
                )}
                {soloSignups.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    {soloSignups.length} solo signup(s) still unpaired — pair them first (Signups &amp; Teams tab).
                  </div>
                )}

                <div className="glass-panel rounded-2xl border border-theme p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Roster preview ({previewEntries.length})</h3>
                      <p className="text-[11px] text-muted mt-0.5">Order below seeds the bracket (top = seed 1) or sets auto-distribution order.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDrawMode('order')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${drawMode === 'order' ? 'bg-brand text-white border-brand-text' : 'bg-surface border-theme text-theme'}`}>
                        Seed order
                      </button>
                      <button onClick={() => setDrawMode('groups')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${drawMode === 'groups' && t.format === 'groups_knockout' ? 'bg-brand text-white border-brand-text' : 'bg-surface border-theme text-theme'} disabled:opacity-40`}
                        disabled={t.format !== 'groups_knockout'}>
                        Group assignment
                      </button>
                    </div>
                  </div>

                  {previewEntries.length < 2 ? (
                    <p className="text-xs text-muted">Need at least 2 teams — approve more signups or add teams manually.</p>
                  ) : drawMode === 'order' ? (
                    <ol className="space-y-1.5">
                      {rosterNames().map((e, i) => (
                        <li key={e.playerId}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface border border-theme text-xs">
                          <span className="w-6 text-center font-extrabold text-brand-text">{i + 1}</span>
                          <span className="flex-1 text-theme font-semibold truncate">{e.label}</span>
                          <div className="flex gap-1">
                            <button disabled={i === 0 || busy} onClick={() => setOrder((prev) => {
                              const next = [...prev]
                              ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                              return next
                            })} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button disabled={i === order.length - 1 || busy} onClick={() => setOrder((prev) => {
                              const next = [...prev]
                              ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                              return next
                            })} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="space-y-1.5">
                      {rosterNames().map((e) => (
                        <div key={e.playerId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface border border-theme text-xs">
                          <span className="flex-1 text-theme font-semibold truncate">{e.label}</span>
                          <select value={groupAssign[e.playerId] || ''} onChange={(ev) => setGroupAssign((prev) => ({ ...prev, [e.playerId]: ev.target.value }))}
                            className="px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs">
                            <option value="">No group</option>
                            {groupLabelList.map((l) => <option key={l} value={l}>Group {l}</option>)}
                          </select>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted pt-1">Leave groups empty to auto-distribute (keeps the seed order above).</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-1">
                    <button disabled={busy || t.status !== 'registration_closed'}
                      onClick={() => doDraw({ mode: 'random' }, 'Publish a RANDOM draw? This finalizes the tournament and notifies all players.')}
                      className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold flex items-center gap-2 disabled:opacity-40">
                      <Zap className="w-4 h-4" /> Random draw
                    </button>
                    <button disabled={busy || t.status !== 'registration_closed' || order.length < 2}
                      onClick={() => doDraw({ order }, `Publish the draw with the current seed order? This finalizes the tournament and notifies all players.`)}
                      className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold disabled:opacity-40">
                      Publish seed order
                    </button>
                    {t.format === 'groups_knockout' && (
                      <button disabled={busy || t.status !== 'registration_closed'}
                        onClick={() => {
                          const groups = {}
                          let ok = true
                          for (const l of groupLabelList) groups[l] = []
                          for (const e of rosterNames()) {
                            const g = groupAssign[e.playerId]
                            if (!g) { ok = false; continue }
                            if (groups[g]) groups[g].push(e.playerId)
                          }
                          if (!ok) { say('err', 'Assign every team to a group first (or use auto-distribute)'); return }
                          const empty = groupLabelList.filter((l) => groups[l].length === 0)
                          if (empty.length) { say('err', `Empty group(s): ${empty.join(', ')}`); return }
                          doDraw({ groups, order }, `Publish these ${groupLabelList.length} groups? This finalizes the tournament and notifies all players.`)
                        }}
                        className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold disabled:opacity-40">
                        Publish manual groups
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {/* ── Matches ── */}
          {tab === 'matches' && t && (
            !hasDraw ? (
              <div className="glass-panel rounded-2xl border border-theme p-8 text-center space-y-3">
                <Medal className="w-8 h-8 mx-auto text-muted" />
                <p className="text-theme font-bold text-sm">No draw yet.</p>
                <button onClick={() => setTab('draw')} className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold">Go to Draw</button>
              </div>
            ) : (
              <div className="space-y-6">
                {groupMatches.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Group stage</h3>
                      <span className="text-xs text-muted">
                        {groupMatches.filter((m) => m.status === 'completed').length}/{groupMatches.length} played
                      </span>
                    </div>
                    {detail.standings && <GroupStandings standings={detail.standings} highlight={Number(t.advance_per_group) || 0} />}
                    <div className="space-y-3">
                      {groupLabelList.filter((l) => groupMatches.some((m) => m.group_label === l)).map((label) => (
                        <div key={label} className="glass-panel rounded-2xl border border-theme overflow-hidden">
                          <div className="px-5 py-3 border-b border-theme flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-extrabold flex items-center justify-center">{label}</span>
                            <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Group {label}</span>
                          </div>
                          <div className="divide-y divide-theme/60">
                            {groupMatches.filter((m) => m.group_label === label).sort((a, b) => a.slot_index - b.slot_index).map((m) => (
                              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-[220px] flex-1">
                                  <span className="text-xs text-theme font-semibold text-right min-w-[110px] truncate">{matchTeamName(m, 'a')}</span>
                                  <span className="text-xs font-extrabold text-muted tabular-nums">
                                    {m.status === 'completed' ? `${m.score_a}–${m.score_b}` : 'vs'}
                                  </span>
                                  <span className="text-xs text-theme font-semibold min-w-[110px] truncate">{matchTeamName(m, 'b')}</span>
                                </div>
                                {m.status === 'completed' ? (
                                  <Badge value="completed" map={{ completed: { label: 'Final', cls: 'bg-brand/15 text-brand-text border-brand-text/40' } }} />
                                ) : editableMatch(m) ? (
                                  <ScoreInputs value={scores[m.id] || { a: '', b: '', court: '' }}
                                    onChange={(v) => setScores((prev) => ({ ...prev, [m.id]: v }))}
                                    onSave={() => saveMatch(m)} saving={savingMatch === m.id} disabled={busy} />
                                ) : (
                                  <Badge value="scheduled" map={{ scheduled: { label: 'Waiting', cls: 'bg-slate-400/15 text-muted border-theme' } }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailKnockout.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Knockout stage</h3>
                      <span className="text-xs text-muted">
                        {detailKnockout.filter((m) => m.status === 'completed').length}/{detailKnockout.filter((m) => m.status !== 'bye').length} played
                      </span>
                    </div>
                    <div className="glass-panel rounded-2xl border border-theme p-5">
                      <BracketView rows={detailKnockout} teams={teams} />
                    </div>
                    <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
                      <div className="px-5 py-3 border-b border-theme">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Record knockout results</span>
                      </div>
                      <div className="divide-y divide-theme/60">
                        {[...detailKnockout].sort((a, b) => (a.round_no - b.round_no) || (a.slot_index - b.slot_index)).map((m) => (
                            <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3 min-w-[240px] flex-1">
                                <span className="text-[10px] uppercase font-extrabold text-muted w-20 shrink-0">
                                  R{m.round_no}·{m.slot_index + 1}
                                </span>
                                <span className="text-xs text-theme font-semibold text-right min-w-[110px] truncate">{matchTeamName(m, 'a')}</span>
                                <span className="text-xs font-extrabold text-muted tabular-nums">
                                  {m.status === 'completed' ? `${m.score_a}–${m.score_b}` : m.status === 'bye' ? 'w/o' : 'vs'}
                                </span>
                                <span className="text-xs text-theme font-semibold min-w-[110px] truncate">{matchTeamName(m, 'b')}</span>
                              </div>
                              {m.status === 'completed' ? (
                                <Badge value="completed" map={{ completed: { label: 'Final', cls: 'bg-brand/15 text-brand-text border-brand-text/40' } }} />
                              ) : editableMatch(m) ? (
                                <ScoreInputs value={scores[m.id] || { a: '', b: '', court: '' }}
                                  onChange={(v) => setScores((prev) => ({ ...prev, [m.id]: v }))}
                                  onSave={() => saveMatch(m)} saving={savingMatch === m.id} disabled={busy} />
                              ) : (
                                <Badge value={m.status} map={{ tbd: { label: 'Waiting', cls: 'bg-slate-400/15 text-muted border-theme' }, bye: { label: 'Bye', cls: 'bg-slate-400/15 text-muted border-theme' }, scheduled: { label: 'Ready', cls: 'bg-emerald-400/15 text-emerald-500 border-emerald-400/30' } }} />
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {groupMatches.length > 0 && detailKnockout.length === 0 && (
                  <div className="p-3 rounded-lg bg-sky-400/10 border border-sky-400/30 text-sky-500 dark:text-sky-400 text-xs">
                    The knockout bracket is built automatically once every group match has a result.
                  </div>
                )}
              </div>
            )
          )}
        </>
      )}

      {formOpen && (
        <TournamentFormModal initial={editTarget} submitting={submitting}
          onCancel={() => { setFormOpen(false); setEditTarget(null) }} onSubmit={submitForm} />
      )}
    </div>
  )
}
