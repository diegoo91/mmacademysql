import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import PlayerSearchInput from '../components/PlayerSearchInput'
import TournamentCountdown from '../components/TournamentCountdown'
import BracketView from '../components/BracketView'
import GroupStandings from '../components/GroupStandings'
import {
  SKILL_LEVELS, SIGNUP_STATUS, fmtDateTime, signupCap, formatLabel, matchFormatLabel,
  formatSummary, statusPill, parseDbTs,
} from '../lib/tournament'
import { Trophy, ArrowLeft, RefreshCw, Check, Users, Clock } from 'lucide-react'

function isRegistrationLive(t) {
  if (t.status !== 'registration_open') return false
  const close = parseDbTs(t.registration_close_at)
  if (close && close.getTime() <= Date.now()) return false
  return true
}

function SkillChips({ value, onChange }) {
  const options = ['All', ...SKILL_LEVELS]
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((s) => (
        <button key={s} onClick={() => onChange(s === 'All' ? '' : s)}
          className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
            (value || 'All') === s
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface border border-theme text-theme hover:border-brand-text'}`}>
          {s}
        </button>
      ))}
    </div>
  )
}

function ListCard({ t, onOpen }) {
  const cap = signupCap(t)
  const live = isRegistrationLive(t)
  return (
    <button onClick={() => onOpen(t.id)}
      className="glass-panel rounded-2xl border border-theme p-5 text-left w-full hover:border-brand-text/50 hover:-translate-y-0.5 transition-all space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className={statusPill(t.status)}>{t.status?.replace('_', ' ')}</span>
        <span className="px-2 py-0.5 rounded-full bg-surface border border-theme text-muted text-[10px] font-bold uppercase">
          {t.skill_level}
        </span>
      </div>
      <div>
        <h3 className="font-heading text-lg font-extrabold text-theme leading-tight">{t.name}</h3>
        <p className="text-xs text-muted mt-1">{formatSummary(t)} · {matchFormatLabel(t.match_format)}</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {fmtDateTime(t.registration_close_at)}</span>
      </div>
      {live && <TournamentCountdown target={t.registration_close_at} className="block" />}
      <div className="flex items-center justify-between pt-1 border-t border-theme/60">
        <span className="text-xs font-bold text-theme">{t.signup_count}/{cap} teams</span>
        <span className="text-xs font-bold text-brand-text">
          {Number(t.entry_fee) > 0 ? `${t.entry_fee} EGP` : 'Free'} →
        </span>
      </div>
    </button>
  )
}

export default function Tournament() {
  const { user, openLoginModal } = useAuth()

  const [list, setList] = useState([])
  const [skill, setSkill] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [mySignups, setMySignups] = useState([])

  const [teamName, setTeamName] = useState('')
  const [partner, setPartner] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const navigate = useNavigate()

  const fetchList = useCallback(() => {
    setListLoading(true)
    setListError('')
    const q = skill ? `?skill=${encodeURIComponent(skill)}` : ''
    api.get(`/tournaments${q}`)
      .then((data) => setList(data.tournaments || []))
      .catch((err) => setListError(err.message || 'Failed to load tournaments'))
      .finally(() => setListLoading(false))
  }, [skill])

  const fetchDetail = useCallback(() => {
    if (selectedId == null) return
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    api.get(`/tournaments/${selectedId}`)
      .then((data) => setDetail(data))
      .catch((err) => setDetailError(err.message || 'Failed to load tournament'))
      .finally(() => setDetailLoading(false))
  }, [selectedId])

  const fetchMy = useCallback(() => {
    if (selectedId == null || !user) { setMySignups([]); return }
    api.get(`/tournaments/${selectedId}/my-signup`)
      .then((data) => setMySignups(data.signups || []))
      .catch(() => setMySignups([]))
  }, [selectedId, user])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => {
    setTeamName(''); setPartner(null); setMsg(null); setMySignups([])
    fetchDetail()
    fetchMy()
  }, [fetchDetail, fetchMy])

  const openTournament = (id) => {
    setSelectedId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const t = detail?.tournament || null
  const teams = detail?.teams || []
  const matches = detail?.matches || []
  const knockout = detail?.knockout || []
  const standings = detail?.standings || null
  const groupMatches = matches.filter((m) => m.phase === 'group')
  const cap = t ? signupCap(t) : 0
  const live = t ? isRegistrationLive(t) : false
  const activeSignup = mySignups.find((s) => s.status === 'pending' || s.status === 'approved')
  const full = t ? (detail.signup_count || 0) >= cap : false
  const isPlayer = user?.role === 'player'

  const submitSignup = async (e) => {
    e.preventDefault()
    if (partner && partner.id === user?.id) { setMsg({ type: 'err', text: 'You cannot partner with yourself' }); return }
    setSubmitting(true)
    setMsg(null)
    try {
      const res = await api.post(`/tournaments/${selectedId}/signup`, {
        team_name: teamName.trim() || undefined,
        player2_id: partner?.id || undefined,
      })
      if (res.signup?.payment_required) {
        setTeamName(''); setPartner(null)
        navigate('/payment', {
          state: {
            purpose: 'tournament',
            tournamentName: t.name,
            entryFee: Number(t.entry_fee),
            paymentRef: res.payment?.ref || null,
            paymentId: res.payment?.id || null,
            returnTo: '/tournament',
          },
        })
        return
      }
      setMsg({ type: 'ok', text: 'Signup submitted — waiting for admin approval.' })
      setTeamName(''); setPartner(null)
      fetchMy()
      fetchDetail()
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Signup failed' })
    } finally {
      setSubmitting(false)
    }
  }

  const groupLabels = [...new Set(groupMatches.map((m) => m.group_label || '-'))].sort()

  // ── List view ──────────────────────────────────────────────────────────
  if (selectedId == null) {
    return (
      <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="max-w-6xl mx-auto relative space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-extrabold uppercase tracking-widest">
              <Trophy className="w-4 h-4" />
              <span>Tournaments</span>
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl font-black text-theme">Upcoming Tournaments</h1>
            <p className="text-muted text-sm max-w-xl mx-auto">
              Knockout cups and group stages at MM Padel Academy. Pick a tournament and register your pair.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SkillChips value={skill} onChange={setSkill} />
            <button onClick={fetchList}
              className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
              <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {listLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
          ) : listError ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-rose-400 text-sm">{listError}</p>
              <button onClick={fetchList} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold">Retry</button>
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm space-y-3">
              <Trophy className="w-10 h-10 mx-auto opacity-40" />
              <p>No tournaments found{skill ? ` for “${skill}”` : ''} — check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((row) => <ListCard key={row.id} t={row} onOpen={openTournament} />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Detail view ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="max-w-5xl mx-auto relative space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedId(null); setDetail(null) }}
              className="p-2.5 rounded-xl bg-surface border border-theme text-theme hover:bg-slate-200 dark:hover:bg-slate-800">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-heading text-2xl sm:text-3xl font-black text-theme">{t?.name || '…'}</h1>
                {t && <span className={statusPill(t.status)}>{t.status?.replace('_', ' ')}</span>}
              </div>
              {t && <p className="text-muted text-sm mt-0.5">{formatSummary(t)} · {formatLabel(t.format)}</p>}
            </div>
          </div>
          <button onClick={() => { fetchDetail(); fetchMy(); fetchList() }}
            className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 ${detailLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border flex items-start justify-between gap-3 ${
            msg.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><span className="sr-only">Dismiss</span>✕</button>
          </div>
        )}

        {detailLoading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
        ) : detailError ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-rose-400 text-sm">{detailError}</p>
            <button onClick={() => setSelectedId(null)} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold">Back to tournaments</button>
          </div>
        ) : !t ? null : (
          <>
            {/* Info */}
            <div className="glass-panel rounded-2xl border border-theme p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Skill</div>
                <div className="text-sm font-semibold text-theme">{t.skill_level}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Format</div>
                <div className="text-sm font-semibold text-theme">{matchFormatLabel(t.match_format)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Entry fee</div>
                <div className="text-sm font-semibold text-theme">{Number(t.entry_fee) > 0 ? `${t.entry_fee} EGP` : 'Free'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Teams</div>
                <div className="text-sm font-semibold text-theme">{detail.signup_count}/{cap}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Registration opens</div>
                <div className="text-sm font-semibold text-theme">{fmtDateTime(t.registration_open_at)}</div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Registration closes</div>
                <div className="text-sm font-semibold text-theme">{fmtDateTime(t.registration_close_at)}</div>
              </div>
              {live && (
                <div className="flex items-end">
                  <TournamentCountdown target={t.registration_close_at} label="Closes in" />
                </div>
              )}
            </div>

            {t.notes && (
              <div className="glass-panel rounded-2xl border border-theme px-6 py-4 text-sm text-muted whitespace-pre-wrap">{t.notes}</div>
            )}

            {/* Register */}
            <div className="glass-panel rounded-2xl border border-theme p-6 space-y-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted flex items-center gap-2">
                <Users className="w-4 h-4" /> Registration
              </h3>

              {activeSignup ? (
                <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl bg-brand/10 border border-brand-text/30">
                  <Check className="w-5 h-5 text-brand-text" />
                  <div className="text-sm">
                    <span className="font-bold text-theme">{activeSignup.team_name || 'Your pair'}</span>
                    <span className="text-muted"> — </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border align-middle ${(SIGNUP_STATUS[activeSignup.status] || SIGNUP_STATUS.pending).cls}`}>
                      {(SIGNUP_STATUS[activeSignup.status] || SIGNUP_STATUS.pending).label}
                    </span>
                  </div>
                  {activeSignup.status === 'pending' && Number(t.entry_fee) > 0 && activeSignup.payment_status !== 'payment_approved' && (
                    <button onClick={() => navigate('/payment', {
                      state: {
                        purpose: 'tournament',
                        tournamentName: t.name,
                        entryFee: Number(t.entry_fee),
                        paymentRef: activeSignup.payment_ref || null,
                        paymentId: activeSignup.payment_id || null,
                        returnTo: '/tournament',
                      },
                    })} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold shrink-0">
                      Pay {t.entry_fee} EGP
                    </button>
                  )}
                  {activeSignup.status === 'pending' && (
                    <span className="text-xs text-muted w-full">
                      {Number(t.entry_fee) > 0
                        ? `Pay the ${t.entry_fee} EGP entry fee — the signup confirms once the payment and registration are approved.`
                        : 'Waiting for admin approval.'}
                    </span>
                  )}
                </div>
              ) : !user ? (
                <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl bg-surface border border-theme">
                  <span className="text-sm text-muted">Sign in to register for this tournament.</span>
                  <button onClick={openLoginModal}
                    className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold">
                    Sign in
                  </button>
                </div>
              ) : !isPlayer ? (
                <p className="text-sm text-muted px-1">Only member players can register. Manage this tournament from the admin area.</p>
              ) : !live ? (
                <div className="px-4 py-3 rounded-xl bg-surface border border-theme flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-muted">
                    {t.status === 'registration_closed' || t.status === 'in_progress' || t.status === 'completed'
                      ? 'Registration is closed for this tournament.'
                      : 'Registration is not open yet.'}
                  </span>
                  {t.status === 'registration_open' && <TournamentCountdown target={t.registration_close_at} />}
                </div>
              ) : full ? (
                <div className="px-4 py-3 rounded-xl bg-gold/10 border border-gold/30 text-sm text-gold">
                  This tournament is full ({cap} teams).
                </div>
              ) : (
                <form onSubmit={submitSignup} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Team name (optional)</label>
                      <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={160}
                        placeholder="Leave blank → “You & Partner”"
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Partner (optional — search members)</label>
                      <PlayerSearchInput strict value={partner?.full_name || ''} onChange={() => {}}
                        onPlayerSelect={setPartner} placeholder="e.g. Zain"
                        endpoint="/tournaments/players/search?q=" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="submit" disabled={submitting}
                      className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold disabled:opacity-50">
                      {submitting ? 'Submitting…' : Number(t.entry_fee) > 0 ? `Sign up & Pay (${t.entry_fee} EGP)` : 'Sign up'}
                    </button>
                    <span className="text-xs text-muted">
                      {partner ? `Partner: ${partner.full_name}` : 'Signing up solo? Both players should register — the admin will pair you.'}
                    </span>
                  </div>
                </form>
              )}
            </div>

            {/* Standings */}
            {standings && Object.keys(standings).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Group standings</h3>
                <GroupStandings standings={standings} highlight={Number(t.advance_per_group) || 0} />
              </div>
            )}

            {/* Group matches */}
            {groupMatches.length > 0 && (
              <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
                <div className="px-6 py-4 border-b border-theme">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Group matches</h3>
                </div>
                <div className="divide-y divide-theme/60">
                  {groupLabels.map((label) => (
                    <div key={label} className="px-6 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-extrabold flex items-center justify-center">{label}</span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Group {label}</span>
                      </div>
                      {groupMatches.filter((m) => (m.group_label || '-') === label).sort((a, b) => a.slot_index - b.slot_index).map((m) => {
                        const nameA = teams.find((x) => x.id === m.team_a_id)?.team_name || 'TBD'
                        const nameB = teams.find((x) => x.id === m.team_b_id)?.team_name || 'TBD'
                        const done = m.status === 'completed'
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-3 text-xs pl-8">
                            <span className={`font-semibold truncate ${done && m.winner_team_id === m.team_a_id ? 'text-brand-text font-extrabold' : 'text-theme'}`}>{nameA}</span>
                            <span className="tabular-nums font-extrabold text-muted px-2 shrink-0">
                              {done ? `${m.score_a}–${m.score_b}` : 'vs'}
                            </span>
                            <span className={`font-semibold text-right truncate ${done && m.winner_team_id === m.team_b_id ? 'text-brand-text font-extrabold' : 'text-theme'}`}>{nameB}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Knockout bracket */}
            {knockout.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Knockout bracket</h3>
                <div className="glass-panel rounded-2xl border border-theme p-5">
                  <BracketView rows={knockout} teams={teams} />
                </div>
              </div>
            )}

            {t.status === 'draft' && (
              <p className="text-xs text-muted text-center">Details are still being finalized — check back soon.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
