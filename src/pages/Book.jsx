import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEscapeKey } from '../lib/hooks'
import {
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Flame,
  Image as ImageIcon,
  Info,
  RefreshCw,
  Tag,
  Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { COURTS } from '../data/siteConfig'
import { PRICING, calculatePrice, perSessionRate } from '../data/pricingData'
import { canonTime, formatSlotTime } from '../lib/time'
import PlayerSearchInput from '../components/PlayerSearchInput'

const ALL_TIMES = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']
const COURT_LIST = Array.from({ length: COURTS }, (_, i) => i + 1)

const tierTag = (type) => {
  const tier = PRICING[type]
  return (
    Object.keys(tier)
      .filter((k) => k !== 'name')
      .map(Number)
      .sort((a, b) => a - b)
      .map((c) => tier[c].toLocaleString('en-US'))
      .join(' / ') + ' EGP'
  )
}

const SESSION_TYPES = [
  { value: 'private', label: 'Private Coaching', sub: '1-on-1 Personalised Coaching', tag: tierTag('private') },
  { value: 'group', label: 'Group (2 Persons)', sub: '2-Person Group Session', tag: tierTag('group') },
]

const DAY_OPTIONS = [
  { key: 'sunday', label: 'Sun', name: 'Sunday' },
  { key: 'monday', label: 'Mon', name: 'Monday' },
  { key: 'tuesday', label: 'Tue', name: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', name: 'Wednesday' },
  { key: 'thursday', label: 'Thu', name: 'Thursday' },
]

export default function Book() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [bookedMap, setBookedMap] = useState(() => new Map())
  const [loadingSlots, setLoadingSlots] = useState(true)

  const [mode, setMode] = useState('day')
  const [sessionType, setSessionType] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [showFlyerModal, setShowFlyerModal] = useState(false)
  useEscapeKey(() => setShowFlyerModal(false), showFlyerModal)
  const [balanceInfo, setBalanceInfo] = useState(null)
  const [bookingFromBalance, setBookingFromBalance] = useState(false)
  const [balanceError, setBalanceError] = useState('')

  const [daySelectedDate, setDaySelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [daySelections, setDaySelections] = useState(() => new Map())

  const [weekStartDate, setWeekStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weekDays, setWeekDays] = useState([])
  const [weekTime, setWeekTime] = useState('')
  const [weekCourt, setWeekCourt] = useState(1)
  const [weekWeeks, setWeekWeeks] = useState(1)

  const fetchSlots = () => {
    setLoadingSlots(true)
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 12 * 7)

    api.get(`/slots?from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`)
      .then(slots => {
        const map = new Map()
        for (const s of slots) {
          if (s.status !== 'available') {
              map.set(`${s.date}|${canonTime(s.time)}|${s.court}`, s.player_text)
          }
        }
        setBookedMap(map)
      })
      .catch(() => {})
      .finally(() => setLoadingSlots(false))
  }

  useEffect(() => { fetchSlots() }, [])

  const isTimeBooked = (date, time, court) => bookedMap.has(`${date}|${time}|${court}`)

  const toggleDaySelection = (time, court) => {
    const key = `${time}|${court}`
    const next = new Map(daySelections)
    if (next.has(key)) next.delete(key)
    else next.set(key, { time, court })
    setDaySelections(next)
  }

  const toggleWeekDay = (key) => {
    setWeekDays((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]))
  }

  const daySessions = useMemo(
    () => mode === 'day'
      ? [...daySelections.values()].map((sel) => ({
          time: sel.time,
          court: sel.court,
          date: daySelectedDate,
          label: `${daySelectedDate} · ${formatSlotTime(sel.time)} · Court ${sel.court}`,
        }))
      : [],
    [mode, daySelections, daySelectedDate]
  )

  const weekSessions = useMemo(() => {
    if (mode !== 'week' || !weekTime || weekDays.length === 0) return []
    const sessions = []
    for (let w = 0; w < weekWeeks; w++) {
      for (const dayKey of weekDays) {
        const idx = DAY_OPTIONS.findIndex((d) => d.key === dayKey)
        const base = new Date(`${weekStartDate}T00:00:00`)
        const date = new Date(base)
        date.setDate(base.getDate() + w * 7 + idx)
        const dateStr = date.toISOString().slice(0, 10)
        sessions.push({
          date: dateStr,
          time: weekTime,
          court: weekCourt,
          label: `${dateStr} · ${formatSlotTime(weekTime)} · Court ${weekCourt} · ${dayKey[0].toUpperCase() + dayKey.slice(1)}`,
        })
      }
    }
    return sessions
  }, [mode, weekTime, weekCourt, weekDays, weekWeeks, weekStartDate])

  const activeSessions = mode === 'day' ? daySessions : weekSessions
  const sessionCount = activeSessions.length
  const totalPrice = calculatePrice(sessionType, sessionCount)
  const canContinue = sessionType && sessionCount > 0

  useEffect(() => {
    if (!user) return
    if (!sessionType || sessionCount === 0) { setBalanceInfo(null); return }
    api.get(`/bookings/balance-check?sessionType=${sessionType}&count=${sessionCount}`).then(setBalanceInfo).catch(() => setBalanceInfo(null))
  }, [user, sessionType, sessionCount])

  const handleContinue = async () => {
    if (!user) { navigate('/login'); return }
    setBalanceError('')
    const partner = sessionType === 'group' ? (partnerName.trim() || null) : null
    if (balanceInfo?.hasEnough) {
      setBookingFromBalance(true)
      try {
        await api.post('/bookings/from-balance', {
          sessionType,
          partner,
          sessions: activeSessions.map(s => ({ date: s.date, time: s.time, court: s.court })),
        })
        navigate('/profile')
      } catch (err) {
        // Hard block: insufficient balance → route to payment, no override for players
        if (err.message?.includes('Insufficient balance') || err.message?.includes('INSUFFICIENT_BALANCE')) {
          navigate('/payment', { state: { sessionType, mode, sessions: activeSessions, totalPrice, sessionCount, partner } })
        } else {
          setBalanceError(err.message || 'This slot was just booked by another player — refresh availability and try again.')
        }
      }
      setBookingFromBalance(false)
      return
    }
    // Hard block: no balance available → route to payment
    navigate('/payment', {
      state: { sessionType, mode, sessions: activeSessions, totalPrice, sessionCount, partner },
    })
  }

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-10 left-1/4 w-[500px] h-[300px] bg-brand/10 rounded-full blur-[140px] pointer-events-none" />

      {showFlyerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme/85 backdrop-blur-md animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="modal-title-0">
          <div className="relative max-w-2xl w-full max-h-[90vh] bg-surface rounded-3xl overflow-hidden border border-theme p-2 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h3 id="modal-title-0" className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-brand-text" />
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
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-bold uppercase tracking-widest">
            <Flame className="w-4 h-4" />
            <span>Official Academy Training Packages</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black text-theme">Book Your Training Package</h1>
          <p className="text-muted text-sm max-w-xl mx-auto">
            1 Hour Sessions &bull; Prices are Per Player &bull; {COURTS} Courts &bull; Training Days: Sunday &ndash; Thursday (3:00 PM &ndash; 11:00 PM)
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button onClick={() => setShowFlyerModal(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-text font-bold text-xs border border-brand-text/40 shadow-md transition-all">
              <ImageIcon className="w-4 h-4" /><span>View Official Pricing Flyer</span>
            </button>
            <button onClick={fetchSlots} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-theme font-bold text-xs border border-theme transition-all">
              <RefreshCw className={`w-4 h-4 ${loadingSlots ? 'animate-spin' : ''}`} /><span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="glass-panel rounded-3xl p-6 border border-theme space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm">1</div>
                <h3 className="font-heading text-xl font-extrabold text-theme">Select Session Category</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2" role="radiogroup" aria-label="Session category">
                {SESSION_TYPES.map((item) => {
                  const selected = sessionType === item.value
                  return (
                    <div
                      key={item.value}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setSessionType(item.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSessionType(item.value)
                        }
                      }}
                      className={`p-5 rounded-2xl cursor-pointer border transition-all ${selected ? 'bg-brand/10 border-brand-text ring-1 ring-brand-text' : 'bg-surface/60 border-theme hover:border-slate-300 dark:hover:border-slate-700'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-theme text-base">{item.label}</span>
                        {selected && <CheckCircle2 className="w-5 h-5 text-brand-text" />}
                      </div>
                      <span className="text-xs text-brand-text font-bold block mb-1">{item.tag}</span>
                      <p className="text-xs text-muted">{item.sub}</p>
                    </div>
                  )
                })}
              </div>

              {sessionType === 'group' && (
                <div className="pt-2 space-y-1.5">
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider">
                    Partner name <span className="text-muted normal-case font-medium">(2-person group)</span>
                  </label>
                  {user ? (
                    <PlayerSearchInput
                      value={partnerName}
                      onChange={(v) => setPartnerName(v)}
                      endpoint="/tournaments/players/search?q="
                      placeholder="Search member name…"
                    />
                  ) : (
                    <input
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Partner's full name"
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs focus:outline-none focus:border-brand-text"
                    />
                  )}
                  <p className="text-[11px] text-muted">
                    Both names appear on the schedule slot. Each player pays the per-player group rate.
                  </p>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-theme space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm">2</div>
                <h3 className="font-heading text-xl font-extrabold text-theme">Schedule Your Sessions</h3>
              </div>

              <div className="p-4 rounded-2xl bg-surface/90 border border-theme flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="w-5 h-5 text-brand-text shrink-0" />
                  <div>
                    <span className="text-theme font-bold block">Official Training Days</span>
                    <span className="text-muted">Sunday &ndash; Thursday</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Clock className="w-4 h-4 text-brand-text" />
                  <span>3:00 PM &ndash; 11:00 PM</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setMode('day')} className={`p-3.5 rounded-xl border text-xs font-bold transition-all ${mode === 'day' ? 'bg-brand text-white border-brand-text shadow-md' : 'bg-surface text-theme border-theme'}`}>
                  Per Day Booking
                </button>
                <button onClick={() => setMode('week')} className={`p-3.5 rounded-xl border text-xs font-bold transition-all ${mode === 'week' ? 'bg-brand text-white border-brand-text shadow-md' : 'bg-surface text-theme border-theme'}`}>
                  Per Week Schedule
                </button>
              </div>

              {loadingSlots ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
              ) : mode === 'day' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Date</label>
                    <input type="date" value={daySelectedDate} onChange={(e) => setDaySelectedDate(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
                  </div>
                  <p className="text-xs text-muted">Greyed-out slots are already booked. Tap any available time + court.</p>
                  <div className="overflow-x-auto rounded-2xl border border-theme">
                    <div className="min-w-[320px]">
                      <div className="grid grid-cols-4 bg-surface/80 text-center">
                        <div className="px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider text-muted text-left">Time</div>
                        {COURT_LIST.map((court) => (
                          <div key={court} className="px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider text-brand-text border-l border-theme">Court {court}</div>
                        ))}
                      </div>
                      <div className="divide-y divide-theme">
                        {ALL_TIMES.map((time) => (
                          <div key={time} className="grid grid-cols-4 items-stretch">
                            <div className="px-3 py-2 text-theme font-mono text-[11px] flex items-center bg-surface/80">{formatSlotTime(time)}</div>
                            {COURT_LIST.map((court) => {
                              const booked = isTimeBooked(daySelectedDate, time, court)
                              const selected = daySelections.has(`${time}|${court}`)
                              return (
                                <div key={court} className="px-2 py-1.5 border-l border-theme">
                                  {booked ? (
                                    <div className="px-3 py-2 rounded-xl bg-surface/80 text-muted border border-theme text-center text-xs font-bold line-through">Booked</div>
                                  ) : (
                                    <button onClick={() => toggleDaySelection(time, court)} className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-all ${selected ? 'bg-brand text-white border-brand-text shadow-md shadow-brand/20' : 'bg-surface text-theme border-theme/80 hover:border-brand-text/60'}`}>
                                      {selected ? 'Selected ✓' : 'Select'}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Start Date</label>
                    <input type="date" value={weekStartDate} onChange={(e) => setWeekStartDate(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Days of the Week (Sun &ndash; Thu)</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {DAY_OPTIONS.map((d) => {
                        const checked = weekDays.includes(d.key)
                        return (
                          <button key={d.key} onClick={() => toggleWeekDay(d.key)} className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${checked ? 'bg-brand/20 text-brand-text border-brand-text' : 'bg-surface text-muted border-theme'}`}>
                            <span>{d.label}</span>
                            {checked && <CheckCircle2 className="w-3.5 h-3.5 text-brand-text" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Time Slot</label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_TIMES.map((time) => (
                        <button key={time} onClick={() => setWeekTime(time)} className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${weekTime === time ? 'bg-brand text-white border-brand-text' : 'bg-surface text-theme border-theme/80 hover:border-brand-text/60'}`}>
                        {formatSlotTime(time)}
                      </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Court</label>
                    <div className="flex flex-wrap gap-2">
                      {COURT_LIST.map((court) => (
                        <button key={court} onClick={() => setWeekCourt(court)} className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${weekCourt === court ? 'bg-brand text-white border-brand-text' : 'bg-surface text-theme border-theme/80 hover:border-brand-text/60'}`}>
                          Court {court}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted mt-2">The same court every selected day. Availability is re-checked at booking.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Number of Weeks</label>
                    <div className="inline-flex rounded-xl overflow-hidden border border-theme">
                      <button onClick={() => setWeekWeeks((w) => Math.max(1, w - 1))} className="px-4 py-2 text-brand-text font-bold bg-surface" aria-label="Decrease weeks">−</button>
                      <span className="px-5 py-2 text-center font-bold text-theme bg-surface min-w-12">{weekWeeks}</span>
                      <button onClick={() => setWeekWeeks((w) => Math.min(12, w + 1))} className="px-4 py-2 text-brand-text font-bold bg-surface" aria-label="Increase weeks">+</button>
                    </div>
                    <p className="text-xs text-muted mt-2">Total sessions: {weekDays.length * weekWeeks}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="sticky top-28 glass-panel rounded-3xl p-6 border border-theme shadow-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-theme">
                <h3 className="font-heading text-lg font-extrabold text-theme flex items-center gap-2">
                  <Tag className="w-5 h-5 text-brand-text" /><span>Your Booking</span>
                </h3>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand/10 text-brand-text border border-brand-text/30 uppercase">Live estimate</span>
              </div>

              {!sessionType ? (
                <p className="text-xs text-muted">Select a session category to begin.</p>
              ) : sessionCount === 0 ? (
                <p className="text-xs text-muted">No sessions selected yet.</p>
              ) : (
                <>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1"><span className="text-muted">Category:</span><span className="text-theme font-bold">{PRICING[sessionType].name}</span></div>
                    <div className="flex justify-between py-1"><span className="text-muted">Sessions:</span><span className="text-brand-text font-bold">{sessionCount}</span></div>
                    <div className="flex justify-between py-1"><span className="text-muted">Rate / session:</span><span className="text-theme font-semibold">{perSessionRate(sessionType, sessionCount).toLocaleString()} EGP</span></div>
                  </div>

                  <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {activeSessions.map((s, i) => (
                      <li key={i} className="text-[11px] text-theme bg-surface/80 border border-theme rounded-lg px-2.5 py-1.5">{s.label}</li>
                    ))}
                  </ul>

                  <div className="p-4 rounded-2xl bg-surface/90 border border-theme">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-xs font-bold text-theme block">Total Amount</span>
                        <span className="text-[10px] text-muted font-medium">Per player &bull; 1-hour sessions</span>
                      </div>
                      <div className="text-right">
                        <span className="font-heading text-3xl font-black text-brand-text">{totalPrice.toLocaleString()}</span>
                        <span className="text-xs font-bold text-theme ml-1">EGP</span>
                      </div>
                    </div>
                  </div>

                  {balanceError && (
                    <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-500 dark:text-rose-400 leading-relaxed">
                      {balanceError}
                    </div>
                  )}

                  <button onClick={handleContinue} disabled={!canContinue || bookingFromBalance} className="w-full py-4 rounded-2xl bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-sm shadow-xl shadow-gold/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
                    <span>{bookingFromBalance ? 'Booking...' : user ? (balanceInfo?.hasEnough ? 'Book from Balance' : `Continue to Payment (${totalPrice.toLocaleString()} EGP)`) : 'Login to Continue'}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  {!user && (
                    <Link to="/guest-booking" className="w-full py-3 rounded-xl bg-surface border border-theme text-theme font-bold text-xs text-center flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                      <Users className="w-4 h-4" />
                      <span>Continue as Guest (No Account Needed)</span>
                    </Link>
                  )}

                  <p className="text-[11px] text-muted text-center flex items-center justify-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    <span>Passes directly to InstaPay Checkout</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
