import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarCheck,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Grid,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { COURTS } from '../data/siteConfig'

const TIME_LABELS = {
  '14:00': '2:00–3:00', '15:00': '3:00–4:00', '16:00': '4:00–5:00',
  '17:00': '5:00–6:00', '18:00': '6:00–7:00', '19:00': '7:00–8:00',
  '20:00': '8:00–9:00', '21:00': '9:00–10:00', '22:00': '10:00–11:00',
  '23:00': '11:00–12:00',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function groupSlotsByDate(slots) {
  const map = new Map()
  for (const s of slots) {
    if (!map.has(s.date)) map.set(s.date, [])
    map.get(s.date).push(s)
  }
  return map
}

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${Number(d)}/${Number(m)}`
}

function getDayName(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00')
  return DAY_NAMES[dt.getDay()]
}

export default function Schedule() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [scheduleView, setScheduleView] = useState('day')
  const [mineOnly, setMineOnly] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(() => toLocalDateStr(new Date()))
  const [showFlyerModal, setShowFlyerModal] = useState(false)
  const [slots, setSlots] = useState([])
  const [myBookings, setMyBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [balanceInfo, setBalanceInfo] = useState(null)
  const mySessionKeys = useMemo(() => {
    const keys = new Set()
    for (const b of myBookings) {
      if (b.status !== 'confirmed') continue
      try {
        const sessions = JSON.parse(b.sessions_json || '[]')
        for (const s of sessions) keys.add(`${s.date}|${s.time}|${s.court}`)
      } catch {}
    }
    return keys
  }, [myBookings])

  const awaitingConfirmationSlots = useMemo(() => {
    if (!user) return []
    const name = (user.name || '').toLowerCase()
    return slots.filter(s => {
      if (s.status !== 'schedule_approved') return false
      if (!s.player_text) return false
      const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
      return names.includes(name)
    })
  }, [user, slots])

  const mySlotKeys = useMemo(() => {
    if (!user) return new Set()
    const keys = new Set()
    const name = (user.name || '').toLowerCase()
    if (!name) return keys
    for (const s of slots) {
      const playerName = (s.player_text || '').split(/\s*\/\s*/)[0].trim().toLowerCase()
      if (playerName === name) keys.add(`${s.date}|${s.time}|${s.court}`)
    }
    return keys
  }, [user, slots])

  const fetchSlots = () => {
    setLoading(true)
    setError('')
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 30)
    const to = new Date(today)
    to.setDate(today.getDate() + 30)

    api.get(`/slots?from=${toLocalDateStr(from)}&to=${toLocalDateStr(to)}&visible_only=1`)
      .then(setSlots)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSlots()
    if (user) {
      api.get('/bookings').then(data => setMyBookings(data.bookings || [])).catch(() => {})
      api.get('/bookings/balance-check?sessionType=private&count=1').then(setBalanceInfo).catch(() => {})
    }
  }, [user])

  const handleConfirmSlot = async (slotId) => {
    try {
      await api.put(`/slots/${slotId}/confirm`)
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, status: 'player_confirmed' } : s))
    } catch (err) {
      alert(err.message || 'Failed to confirm')
    }
  }

  const handleDeclineSlot = async (slotId) => {
    try {
      await api.put(`/slots/${slotId}/decline`)
      setSlots(prev => prev.filter(s => s.id !== slotId))
    } catch (err) {
      alert(err.message || 'Failed to decline')
    }
  }

  const handleProceedToBook = () => {
    if (!user) { navigate('/login'); return }
    navigate('/book')
  }

  const filteredSlots = useMemo(() => {
    if (!mineOnly || !user) return slots
    const name = (user.name || '').toLowerCase()
    return slots.filter(s => {
      if (s.player_text) {
        const names = s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase())
        if (names.includes(name)) return true
      }
      return s.user_id === user.id
    })
  }, [slots, mineOnly, user])

  const slotsByDate = useMemo(() => groupSlotsByDate(filteredSlots), [filteredSlots])

  const availableDates = useMemo(() => {
    return [...slotsByDate.keys()].sort()
  }, [slotsByDate])

  const dateChips = useMemo(() => {
    return availableDates.map(d => ({
      date: d,
      label: `${getDayName(d)} ${formatDateShort(d)}`,
    }))
  }, [availableDates])

  const currentDaySlots = useMemo(() => {
    const daySlots = slotsByDate.get(scheduleDate) || []
    const times = [...new Set(daySlots.map(s => s.time))].sort()
    return times.map(time => {
      const c1 = daySlots.find(s => s.time === time && s.court === 1)
      const c2 = daySlots.find(s => s.time === time && s.court === 2)
      const c3 = daySlots.find(s => s.time === time && s.court === 3)
      return {
        time,
        label: TIME_LABELS[time] || time,
        court1: c1?.player_text || '',
        court2: c2?.player_text || '',
        court3: c3?.player_text || '',
        slot1: c1 || null,
        slot2: c2 || null,
        slot3: c3 || null,
      }
    })
  }, [scheduleDate, slotsByDate])

  const weekTimes = useMemo(() => {
    const set = new Set()
    for (const s of slots) {
      set.add(s.time)
    }
    return [...set].sort()
  }, [slots])

  const weekDates = useMemo(() => {
    const d = new Date(scheduleDate + 'T00:00:00')
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    const dates = []
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start)
      dd.setDate(start.getDate() + i)
      dates.push(toLocalDateStr(dd))
    }
    return dates
  }, [scheduleDate])

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-10 left-1/4 w-[500px] h-[300px] bg-lime-500/10 rounded-full blur-[140px] pointer-events-none" />

      {showFlyerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme/85 backdrop-blur-md animate-fadeIn">
          <div className="relative max-w-2xl w-full max-h-[90vh] bg-surface rounded-3xl overflow-hidden border border-theme p-2 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h3 className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-lime-400" />
                <span>Official MM Padel Academy Pricing Flyer</span>
              </h3>
              <button onClick={() => setShowFlyerModal(false)} className="px-3 py-1 rounded-full bg-surface hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-theme">Close ✕</button>
            </div>
            <div className="overflow-auto p-2 flex justify-center">
              <img src={`${import.meta.env.BASE_URL}images/pricing.jpg`} alt="MM Padel Academy Official Pricing" className="rounded-2xl max-h-[75vh] object-contain shadow-2xl" />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-bold uppercase tracking-widest">
            <Flame className="w-4 h-4" />
            <span>Official Court Availability & Schedule</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black text-theme">Academy Booking Schedule</h1>
          <p className="text-muted text-sm max-w-xl mx-auto">
            Sunday to Thursday • 3:00 PM to 11:00 PM • {COURTS} courts • All sessions 1 hour • Live from server.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button onClick={() => setShowFlyerModal(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-lime-400 font-bold text-xs border border-lime-400/40 shadow-md transition-all">
              <ImageIcon className="w-4 h-4" />
              <span>View Official Pricing Flyer</span>
            </button>
            <button onClick={fetchSlots} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-theme font-bold text-xs border border-theme transition-all">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-rose-400 text-sm mb-4">{error}</p>
            <button onClick={fetchSlots} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Retry</button>
          </div>
        ) : (
          <>
            {user && awaitingConfirmationSlots.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-sm font-bold text-center">
                ⏳ You have {awaitingConfirmationSlots.length} slot{awaitingConfirmationSlots.length > 1 ? 's' : ''} awaiting your confirmation — tap Confirm on any highlighted slot below.
              </div>
            )}

            <div className="glass-panel rounded-3xl p-6 border border-theme flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme">
                <button onClick={() => setScheduleView('day')} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${scheduleView === 'day' ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'}`}>
                  <CalendarIcon className="w-4 h-4" />            <span>Day view (3 Courts)</span>
                </button>
                <button onClick={() => setScheduleView('week')} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${scheduleView === 'week' ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'}`}>
                  <Grid className="w-4 h-4" /><span>Week view</span>
                </button>
              </div>

              {user && (
                <button
                  onClick={() => setMineOnly(v => !v)}
                  className={`px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${mineOnly ? 'bg-purple-500 text-white shadow-md' : 'bg-surface border border-theme text-muted hover:border-purple-400/50'}`}
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>My Schedule</span>
                </button>
              )}
              {!user && (
                <Link to="/login" className="px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 border bg-surface text-muted border-theme hover:border-lime-400/50 opacity-60">
                  <UserCheck className="w-4 h-4" />
                  <span>Login to view My Schedule</span>
                </Link>
              )}

              {scheduleView === 'day' && (
                <div className="flex items-center gap-3">
                  <button onClick={() => { const d = new Date(scheduleDate + 'T00:00:00'); d.setDate(d.getDate() - 1); setScheduleDate(toLocalDateStr(d)) }} className="p-2 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:border-lime-400 transition-all" title="Previous day">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
                  <button onClick={() => { const d = new Date(scheduleDate + 'T00:00:00'); d.setDate(d.getDate() + 1); setScheduleDate(toLocalDateStr(d)) }} className="p-2 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:border-lime-400 transition-all" title="Next day">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              {scheduleView === 'week' && (
                <div className="flex items-center gap-3">
                  <button onClick={() => { const d = new Date(scheduleDate + 'T00:00:00'); d.setDate(d.getDate() - 7); setScheduleDate(toLocalDateStr(d)) }} className="p-2 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:border-lime-400 transition-all" title="Previous week">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-theme">{getDayName(weekDates[0])} {formatDateShort(weekDates[0])} – {getDayName(weekDates[6])} {formatDateShort(weekDates[6])}</span>
                  <button onClick={() => { const d = new Date(scheduleDate + 'T00:00:00'); d.setDate(d.getDate() + 7); setScheduleDate(toLocalDateStr(d)) }} className="p-2 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:border-lime-400 transition-all" title="Next week">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-lime-400" /><span className="text-theme">Available</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" /><span className="text-theme">Booked</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /><span className="text-theme">Pending</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500" /><span className="text-theme">Awaiting You</span></div>
              </div>
            </div>

            {scheduleView === 'day' ? (
              <div className="glass-panel rounded-3xl p-6 border border-theme mb-8">
                <div className="flex items-center justify-between pb-3 border-b border-theme mb-4">
                  <h3 className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-lime-400" />
                    <span>{getDayName(scheduleDate)} {formatDateShort(scheduleDate)}</span>
                  </h3>
                  <span className="text-xs text-lime-400 font-bold bg-lime-400/10 px-3 py-1 rounded-full border border-lime-400/30">3 Courts • Live</span>
                </div>

                {currentDaySlots.length === 0 ? (
                  <p className="text-sm text-muted py-8 text-center">No slots scheduled for this date — all courts are free all evening.</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-theme">
                    <div className="grid grid-cols-4 bg-surface text-center">
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-muted text-left">Time</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 1</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 2</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 3</div>
                    </div>
                    <div className="divide-y divide-theme">
                      {currentDaySlots.map((slot) => (
                        <div key={slot.time} className="grid grid-cols-4 items-stretch text-sm">
                          <div className="px-4 py-3 text-theme font-mono text-xs flex items-center gap-1.5 bg-surface">
                            <Clock className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                            {slot.label}
                          </div>
                           {[slot.slot1, slot.slot2, slot.slot3].map((slotObj, i) => {
                            const courtNum = i + 1
                            const player = slotObj?.player_text || ''
                            const isMine = mySlotKeys.has(`${scheduleDate}|${slot.time}|${courtNum}`) || mySessionKeys.has(`${scheduleDate}|${slot.time}|${courtNum}`)
                            const isAwaiting = slotObj?.status === 'schedule_approved' && isMine
                            return (
                               <div key={i} className={`px-4 py-3 border-l border-theme text-xs font-bold text-center flex flex-col items-center justify-center gap-1 ${
                                isMine ? 'bg-lime-400/15 text-lime-400' : 'bg-lime-400/5 text-lime-400'
                              }`}>
                                {player || 'Available'}{isMine ? ' ★' : ''}
                                {player && (
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${(slotObj?.session_type || 'private') === 'group' ? 'bg-purple-400/20 text-purple-400' : 'bg-blue-400/20 text-blue-400'}`}>
                                    {(slotObj?.session_type || 'private') === 'group' ? 'GRP' : 'PVT'}
                                  </span>
                                )}
                                {player && slotObj?.coach_name && (
                                  <span className="text-[9px] font-bold text-amber-400">{slotObj.coach_name}</span>
                                )}
                                {isAwaiting && (
                                  <span className="text-[9px] font-bold text-purple-400">⏳ Awaiting you</span>
                                )}
                                {isAwaiting && (
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => handleConfirmSlot(slotObj.id)} className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[9px] font-bold flex items-center gap-0.5">
                                      <Check className="w-2.5 h-2.5" />Confirm
                                    </button>
                                    <button onClick={() => handleDeclineSlot(slotObj.id)} className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[9px] font-bold flex items-center gap-0.5">
                                      <X className="w-2.5 h-2.5" />Decline
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-panel rounded-3xl p-6 border border-theme overflow-x-auto mb-8">
                <div className="min-w-[950px]">
                  <div className="grid grid-cols-8 gap-3 pb-4 border-b border-theme text-center font-heading text-sm font-extrabold text-theme">
                    <div className="text-left text-muted text-xs uppercase">Time Slot</div>
                    {weekDates.map(date => (
                      <button key={date} onClick={() => { setScheduleDate(date); setScheduleView('day') }} className="text-lime-400 text-xs hover:text-lime-300 hover:underline cursor-pointer transition-all">{getDayName(date)} ({formatDateShort(date)})</button>
                    ))}
                  </div>
                  <div className="divide-y divide-theme pt-2 space-y-2">
                    {weekTimes.map(time => (
                      <div key={time} className="grid grid-cols-8 gap-3 py-2 items-center text-xs">
                        <div className="font-bold text-theme font-mono flex items-center gap-1.5 text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-lime-400" />
                          <span>{TIME_LABELS[time] || time}</span>
                        </div>
                        {weekDates.map(date => {
                          const daySlots = slotsByDate.get(date) || []
                          const s = daySlots.find(x => x.time === time && x.court === 1)
                          const s2 = daySlots.find(x => x.time === time && x.court === 2)
                          const s3 = daySlots.find(x => x.time === time && x.court === 3)
                          const c1 = s?.player_text || ''
                          const c2 = s2?.player_text || ''
                          const c3 = s3?.player_text || ''
                          const empty = !c1 && !c2 && !c3
                          const isMine = mySlotKeys.has(`${date}|${time}|1`) || mySlotKeys.has(`${date}|${time}|2`) || mySlotKeys.has(`${date}|${time}|3`) || mySessionKeys.has(`${date}|${time}|1`) || mySessionKeys.has(`${date}|${time}|2`) || mySessionKeys.has(`${date}|${time}|3`)
                          return (
                            <div key={date} className={`p-2.5 rounded-xl border text-[11px] font-bold text-center leading-snug ${
                              empty ? 'bg-surface text-muted border-theme'
                              : isMine ? 'bg-lime-400/15 border-lime-400/40 text-lime-400'
                              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            }`}>
                              {empty ? 'Available' : (
                                <span className="block">{[c1 && `C1: ${c1}`, c2 && `C2: ${c2}`, c3 && `C3: ${c3}`].filter(Boolean).join(' / ')}{isMine ? ' ★' : ''}</span>
                              )}
                              {!empty && (() => {
                                const allSlots = (slotsByDate.get(date) || []).filter(x => x.time === time)
                                const coachNames = [...new Set(allSlots.map(x => x.coach_name).filter(Boolean))]
                                return coachNames.length > 0 ? <span className="block text-[9px] text-amber-400 mt-0.5">{coachNames.join(', ')}</span> : null
                              })()}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="p-6 rounded-3xl bg-gradient-to-r from-lime-500/10 via-white dark:via-slate-900 to-white dark:to-slate-900 border border-theme flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-lime-400 text-slate-950 font-bold"><CheckCircle2 className="w-6 h-6 stroke-[2.5]" /></div>
            <div>
              <h4 className="font-heading font-extrabold text-theme text-base">Found an open slot?</h4>
              <p className="text-xs text-muted">Head to booking and lock in your 1-hour session.</p>
            </div>
          </div>
          <button onClick={handleProceedToBook} className="px-6 py-3.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs shadow-lg shadow-lime-400/20 transition-all flex items-center gap-2 shrink-0">
            <span>Proceed to Book a Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  )
}
