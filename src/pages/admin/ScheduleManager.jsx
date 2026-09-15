import { useState, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, Check, Clock, Download, FileSpreadsheet, Plus, Trash2, Upload, X, ArrowRightLeft, Undo2, UserCheck, Settings } from 'lucide-react'
import { api, downloadFile } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import PlayerSearchInput from '../../components/PlayerSearchInput'

const TIME_LABELS = {
  '14:00': '2:00–3:00', '15:00': '3:00–4:00', '16:00': '4:00–5:00',
  '17:00': '5:00–6:00', '18:00': '6:00–7:00', '19:00': '7:00–8:00',
  '20:00': '8:00–9:00', '21:00': '9:00–10:00', '22:00': '10:00–11:00',
  '23:00': '11:00–12:00',
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ALL_TIMES = ['14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00']

const STATUS_COLORS = {
  available: 'bg-lime-400/5 text-lime-400',
  payment_pending: 'bg-amber-500/10 text-amber-400',
  payment_approved: 'bg-blue-500/10 text-blue-400',
  schedule_approved: 'bg-purple-500/10 text-purple-400',
  player_confirmed: 'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-rose-500/10 text-rose-400',
  denied: 'bg-rose-500/10 text-rose-400',
}

const STATUS_LABELS = {
  available: 'Available',
  payment_pending: 'Payment Pending',
  payment_approved: 'Payment Approved',
  schedule_approved: 'Awaiting Player',
  player_confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  denied: 'Denied',
}

function formatDateShort(d) { const [,m,day] = d.split('-'); return `${Number(day)}/${Number(m)}` }
function getDayName(d) { return DAY_NAMES[new Date(d + 'T00:00:00').getDay()] }

export default function ScheduleManager() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const canEdit = isAdmin
  const [activeTab, setActiveTab] = useState('schedule')
  const [view, setView] = useState('day')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [editSlot, setEditSlot] = useState(null)
  const [addSlot, setAddSlot] = useState(null)
  const [addForm, setAddForm] = useState({ date: '', time: '15:00', court: 1, player_text: '', session_type: null, coach_id: null })
  const [addPartner, setAddPartner] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [conversionRequests, setConversionRequests] = useState([])
  const [convLoading, setConvLoading] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [uploadMessage, setUploadMessage] = useState(null)
  const [balanceWarning, setBalanceWarning] = useState(null)
  const [pendingOverride, setPendingOverride] = useState(null)
  const [dayActionLoading, setDayActionLoading] = useState(null)
  const [coaches, setCoaches] = useState([])
  const [courtDefaults, setCourtDefaults] = useState([])
  const [courtDefaultsDraft, setCourtDefaultsDraft] = useState({})
  const [courtDefaultsSaving, setCourtDefaultsSaving] = useState(false)

  const fetchSlots = () => {
    setLoading(true)
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - 30)
    const end = new Date(today)
    end.setDate(today.getDate() + 30)
    api.get(`/slots?from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`)
      .then(setSlots)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const fetchConversionRequests = () => {
    setConvLoading(true)
    api.get('/conversion-requests').then(setConversionRequests).catch(() => {}).finally(() => setConvLoading(false))
  }

  useEffect(() => { fetchSlots(); fetchConversionRequests(); fetchCoachesAndDefaults() }, [])

  const fetchCoachesAndDefaults = () => {
    api.get('/users').then(data => {
      const coachList = (Array.isArray(data) ? data : data.users || []).filter(u => u.role === 'coach')
      setCoaches(coachList)
    }).catch(() => {})
    api.get('/slots/court-defaults').then(defaults => {
      setCourtDefaults(defaults)
      const draft = {}
      for (const d of defaults) draft[d.court] = d.coach_id || ''
      setCourtDefaultsDraft(draft)
    }).catch(() => {})
  }

  const saveCourtDefaults = async () => {
    setCourtDefaultsSaving(true)
    try {
      const updates = [1, 2, 3].map(court => ({
        court,
        coach_id: courtDefaultsDraft[court] ? parseInt(courtDefaultsDraft[court]) : null,
      }))
      await Promise.all(updates.map(u => api.put('/slots/court-defaults', u)))
      await fetchCoachesAndDefaults()
    } catch (err) {
      alert('Failed to save court defaults')
    }
    setCourtDefaultsSaving(false)
  }

  const checkPlayerBalance = (player) => {
    if (!player || isSuperAdmin) return null
    const priv = player.private_balance || 0
    const grp = player.group_balance || 0
    const total = priv + grp
    if (total > 0) return null
    if (!player.balance_zero_since) return null
    const zeroDate = new Date(player.balance_zero_since)
    const now = new Date()
    const diffDays = Math.floor((now - zeroDate) / (1000 * 60 * 60 * 24))
    if (diffDays > 14) {
      return { type: 'blocked', player: player.full_name, days: diffDays }
    }
    return { type: 'warning', player: player.full_name, days: diffDays, proceed: true }
  }

  const slotsByDate = useMemo(() => {
    const map = new Map()
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date).push(s)
    }
    return map
  }, [slots])

  const availableDates = useMemo(() => [...slotsByDate.keys()].sort(), [slotsByDate])
  const weekDates = useMemo(() => {
    const d = new Date(date + 'T00:00:00')
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    const dates = []
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start)
      dd.setDate(start.getDate() + i)
      dates.push(dd.toISOString().slice(0, 10))
    }
    return dates
  }, [date])
  const weekTimes = useMemo(() => {
    const set = new Set()
    for (const s of slots) set.add(s.time)
    return [...set].sort()
  }, [slots])

  const currentDaySlots = useMemo(() => {
    const daySlots = slotsByDate.get(date) || []
    const times = [...new Set(daySlots.map(s => s.time))].sort()
    return times.map(time => {
      const c1 = daySlots.find(s => s.time === time && s.court === 1)
      const c2 = daySlots.find(s => s.time === time && s.court === 2)
      const c3 = daySlots.find(s => s.time === time && s.court === 3)
      return { time, label: TIME_LABELS[time] || time, slot1: c1 || null, slot2: c2 || null, slot3: c3 || null }
    })
  }, [date, slotsByDate])

  // Check if day has any payment_approved slots (can approve day)
  const dayStats = useMemo(() => {
    const daySlots = slotsByDate.get(date) || []
    const paymentApproved = daySlots.filter(s => s.status === 'payment_approved').length
    const scheduleApproved = daySlots.filter(s => s.status === 'schedule_approved').length
    const confirmed = daySlots.filter(s => s.status === 'player_confirmed').length
    const pending = daySlots.filter(s => s.status === 'payment_pending').length
    return { total: daySlots.length, paymentApproved, scheduleApproved, confirmed, pending }
  }, [date, slotsByDate])

  const handleDeleteSlot = async (id) => {
    try { await api.del(`/slots/${id}`); fetchSlots() } catch {}
  }

  const handleApproveSlot = async (id) => {
    try {
      await api.put(`/slots/${id}/approve`)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to approve')
    }
  }

  const handleToggleType = async (slot) => {
    try {
      await api.put(`/slots/${slot.id}/toggle-type`)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to toggle type')
    }
  }

  const handleApproveDay = async () => {
    setDayActionLoading('approve')
    try {
      const result = await api.put(`/slots/day/${date}/approve`)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to approve day')
    }
    setDayActionLoading(null)
  }

  const handleUndoDay = async () => {
    setDayActionLoading('undo')
    try {
      const result = await api.put(`/slots/day/${date}/undo`)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to undo day approval')
    }
    setDayActionLoading(null)
  }

  const handleMarkAttended = async (id) => {
    try {
      await api.put(`/slots/${id}/mark-attended`)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to mark attended')
    }
  }

  const handleAddSlot = async () => {
    if (selectedPlayer && !isSuperAdmin) {
      const priv = selectedPlayer.private_balance || 0
      const grp = selectedPlayer.group_balance || 0
      if (priv + grp <= 0 && selectedPlayer.balance_zero_since) {
        const zeroDate = new Date(selectedPlayer.balance_zero_since)
        const now = new Date()
        const diffDays = Math.floor((now - zeroDate) / (1000 * 60 * 60 * 24))
        if (diffDays > 14) {
          setBalanceWarning({ type: 'blocked', player: selectedPlayer.full_name, days: diffDays })
          return
        }
      }
    }
    try {
      const payload = { ...addForm }
      if (addForm.session_type === 'group' && addPartner.trim()) {
        payload.player_text = `${addForm.player_text} / ${addPartner.trim()}`
      }
      await api.post('/slots', payload)
      setAddSlot(null)
      setAddForm({ date: '', time: '15:00', court: 1, player_text: '', session_type: null, coach_id: null })
      setAddPartner('')
      setSelectedPlayer(null)
      fetchSlots()
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('INSUFFICIENT_BALANCE') || msg.includes('409')) {
        const payload = { ...addForm }
        if (addForm.session_type === 'group' && addPartner.trim()) {
          payload.player_text = `${addForm.player_text} / ${addPartner.trim()}`
        }
        const player = selectedPlayer?.full_name || addForm.player_text
        const stype = addForm.session_type || 'private'
        const remaining = selectedPlayer ? (selectedPlayer[stype + '_balance'] || 0) : 0
        setPendingOverride({ payload, player, sessionType: stype, remaining })
      }
    }
  }

  const handleConvertAction = async (id, action) => {
    try {
      await api.put(`/conversion-requests/${id}/${action}`)
      fetchConversionRequests()
    } catch {}
  }

  const handleOverrideConfirm = async (mode) => {
    if (!pendingOverride) return
    const payload = { ...pendingOverride.payload, balanceOverride: mode }
    try {
      await api.post('/slots', payload)
      setPendingOverride(null)
      setAddSlot(null)
      setAddForm({ date: '', time: '15:00', court: 1, player_text: '', session_type: null, coach_id: null })
      setAddPartner('')
      setSelectedPlayer(null)
      fetchSlots()
    } catch (err) {
      alert(err.message || 'Failed to add slot')
    }
  }

  const handleUploadFile = async () => {
    if (!importFile) return
    setImporting(true)
    setUploadMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const preview = await api.upload('/imports/schedule/preview', fd)
      setImportPreview(preview)
      setUploadMessage(null)
    } catch (err) {
      setUploadMessage({ type: 'error', text: err.message || 'Upload failed. Please try again.' })
      setImportPreview(null)
    }
    setImporting(false)
  }

  const handleCommitImport = async () => {
    if (!importPreview) return
    try {
      const result = await api.post('/imports/schedule/commit', { rows: importPreview.allRows || importPreview.preview, filename: importPreview.filename })
      setUploadMessage({ type: 'success', text: `Imported ${result.inserted} time slots from ${importPreview.filename || 'file'}.` })
      setImportPreview(null)
      setImportFile(null)
      fetchSlots()
      setActiveTab('schedule')
    } catch (err) {
      setUploadMessage({ type: 'error', text: err.message || 'Commit failed. Please try again.' })
    }
  }

  const pendingConversions = conversionRequests.filter(r => r.status === 'pending')

  const renderSlotActions = (slot) => {
    if (!canEdit || !slot) return null
    return (
      <div className="flex gap-1 shrink-0">
        {slot.status === 'payment_approved' && (
          <button onClick={() => handleApproveSlot(slot.id)} className="p-0.5 text-emerald-400 hover:text-emerald-300" title="Approve">
            <Check className="w-3 h-3" />
          </button>
        )}
        {slot.status === 'schedule_approved' && (
          <button onClick={() => handleMarkAttended(slot.id)} className="p-0.5 text-cyan-400 hover:text-cyan-300" title="Mark Attended (retroactive)">
            <UserCheck className="w-3 h-3" />
          </button>
        )}
        {slot.status !== 'available' && slot.status !== 'player_confirmed' && (
          <button onClick={() => handleToggleType(slot)} className="p-0.5 text-slate-400 hover:text-amber-400" title="Toggle Private/Group">
            <ArrowRightLeft className="w-3 h-3" />
          </button>
        )}
        <button onClick={() => setEditSlot(slot)} className="p-0.5 text-slate-400 hover:text-blue-400" title="Edit"><CalendarIcon className="w-3 h-3" /></button>
        <button onClick={() => handleDeleteSlot(slot.id)} className="p-0.5 text-slate-400 hover:text-rose-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-black text-theme">Schedule Manager</h1>
        <p className="text-muted text-sm mt-1">Manage slots, upload schedules, and conversion requests</p>
      </div>

      <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme w-fit">
        {[
          { id: 'schedule', label: 'Schedule', icon: CalendarIcon },
          { id: 'upload', label: 'Upload', icon: Upload },
          { id: 'conversions', label: `Conversions${pendingConversions.length > 0 ? ` (${pendingConversions.length})` : ''}`, icon: FileSpreadsheet },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'}`}>
            <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {isSuperAdmin && coaches.length > 0 && (
        <div className="glass-panel rounded-2xl border border-theme p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-lime-400" />
            <h3 className="text-sm font-bold text-theme">Court Coach Defaults</h3>
          </div>
          <p className="text-[11px] text-muted mb-3">Default coach auto-fills when adding a slot to that court (overridable per slot).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(court => (
              <div key={court}>
                <label className="block text-[10px] font-bold text-muted uppercase mb-1">Court {court}</label>
                <select
                  value={courtDefaultsDraft[court] || ''}
                  onChange={e => setCourtDefaultsDraft({ ...courtDefaultsDraft, [court]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs"
                >
                  <option value="">No default</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button
            onClick={saveCourtDefaults}
            disabled={courtDefaultsSaving}
            className="mt-3 px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold disabled:opacity-50"
          >
            {courtDefaultsSaving ? 'Saving...' : 'Save Defaults'}
          </button>
        </div>
      )}

      {activeTab === 'schedule' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme">
              <button onClick={() => setView('day')} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${view === 'day' ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'}`}>
                <CalendarIcon className="w-4 h-4" /><span>Day View</span>
              </button>
              <button onClick={() => setView('week')} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${view === 'week' ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'}`}>
                <CalendarIcon className="w-4 h-4" /><span>Week View</span>
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
              {canEdit && (
                <button onClick={() => { setAddSlot(true); setAddForm({ ...addForm, date }) }} className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Add Slot
                </button>
              )}
            </div>
          </div>

          {/* Day Approval Bar */}
          {canEdit && view === 'day' && dayStats.total > 0 && (
            <div className="glass-panel rounded-2xl border border-theme p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted">Status for {getDayName(date)} {formatDateShort(date)}:</span>
                {dayStats.paymentApproved > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-bold border border-blue-400/20">{dayStats.paymentApproved} payment approved</span>}
                {dayStats.scheduleApproved > 0 && <span className="px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400 font-bold border border-purple-400/20">{dayStats.scheduleApproved} awaiting player</span>}
                {dayStats.confirmed > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-bold border border-emerald-400/20">{dayStats.confirmed} confirmed</span>}
                {dayStats.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 font-bold border border-amber-400/20">{dayStats.pending} payment pending</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                {dayStats.paymentApproved > 0 && (
                  <button onClick={handleApproveDay} disabled={dayActionLoading === 'approve'} className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold disabled:opacity-50 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Approve Day ({dayStats.paymentApproved})
                  </button>
                )}
                {dayStats.scheduleApproved > 0 && (
                  <button onClick={handleUndoDay} disabled={dayActionLoading === 'undo'} className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-bold disabled:opacity-50 flex items-center gap-1">
                    <Undo2 className="w-3 h-3" /> Undo Day Approval ({dayStats.scheduleApproved})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Status Legend */}
          {canEdit && view === 'day' && (
            <div className="flex flex-wrap gap-2 text-[10px]">
              {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'available').map(([key, label]) => (
                <span key={key} className={`px-2 py-0.5 rounded-full font-bold border ${STATUS_COLORS[key]} border-current/20`}>
                  {label}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : view === 'day' ? (
            <div className="glass-panel rounded-3xl p-6 border border-theme">
              <div className="flex items-center justify-between pb-3 border-b border-theme mb-4">
                <h3 className="font-heading font-extrabold text-theme text-lg">{getDayName(date)} {formatDateShort(date)}</h3>
                <span className="text-xs text-lime-400 font-bold bg-lime-400/10 px-3 py-1 rounded-full border border-lime-400/30">3 Courts</span>
              </div>
              {currentDaySlots.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">No slots for this date.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-theme">
                  <div className="min-w-[320px]">
                    <div className="grid grid-cols-5 bg-slate-100/80 dark:bg-slate-900/80 text-center">
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-muted text-left">Time</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 1</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 2</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-lime-400 border-l border-theme">Court 3</div>
                      <div className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-muted border-l border-theme">Actions</div>
                    </div>
                    <div className="divide-y divide-theme">
                      {currentDaySlots.map((row) => (
                        <div key={row.time} className="grid grid-cols-5 items-stretch text-sm">
                          <div className="px-4 py-3 text-theme font-mono text-xs flex items-center gap-1.5 bg-surface/80">
                            <Clock className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                            {row.label}
                          </div>
                           {[row.slot1, row.slot2, row.slot3].map((slot, i) => {
                            const statusColor = STATUS_COLORS[slot?.status] || STATUS_COLORS.available
                            return (
                            <div key={i} className={`px-4 py-3 border-l border-slate-200/60 dark:border-slate-800/60 text-xs font-bold text-center flex items-center justify-center gap-2 ${statusColor}`}>
                              {slot ? (
                                <>
                                  <div className="flex flex-col items-center gap-0.5 min-w-0">
                                    <span className="truncate">{slot.player_text}</span>
                                    {slot.session_type && (
                                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${slot.session_type === 'group' ? 'bg-purple-400/20 text-purple-400' : 'bg-blue-400/20 text-blue-400'}`}>
                                        {slot.session_type === 'group' ? 'GRP' : 'PVT'}
                                      </span>
                                    )}
                                    {slot.coach_name && (
                                      <span className="text-[8px] font-bold text-amber-400">{slot.coach_name}</span>
                                    )}
                                    <span className="text-[8px] opacity-60">{STATUS_LABELS[slot.status]}</span>
                                  </div>
                                  {renderSlotActions(slot)}
                                </>
                              ) : 'Available'}
                            </div>
                          )})}
                          <div className="px-2 py-3 border-l border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center gap-1">
                            {[1, 2, 3].map(court => {
                              const exists = court === 1 ? row.slot1 : court === 2 ? row.slot2 : row.slot3
                              if (exists) return null
                              if (!canEdit) return null
                              return (
                                <button key={court} onClick={() => { setAddSlot(true); setAddForm({ ...addForm, date, time: row.time, court }) }} className="px-2 py-1 text-[10px] font-bold rounded bg-lime-400/10 text-lime-400 hover:bg-lime-400/20 border border-lime-400/30">
                                  +C{court}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-6 border border-theme overflow-x-auto">
              <div className="min-w-[950px]">
                <div className="grid grid-cols-8 gap-3 pb-4 border-b border-theme text-center font-heading text-sm font-extrabold text-theme">
                  <div className="text-left text-muted text-xs uppercase">Time</div>
                  {weekDates.map(d => (
                    <div key={d} className="text-lime-400 text-xs">{getDayName(d)} ({formatDateShort(d)})</div>
                  ))}
                </div>
                <div className="divide-y divide-theme pt-2 space-y-2">
                  {weekTimes.map(time => (
                    <div key={time} className="grid grid-cols-8 gap-3 py-2 items-center text-xs">
                        <div className="font-bold text-theme font-mono flex items-center gap-1.5 text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-lime-400" />
                        <span>{TIME_LABELS[time] || time}</span>
                      </div>
                       {weekDates.map(d => {
                        const daySlots = slotsByDate.get(d) || []
                        const s1 = daySlots.find(x => x.time === time && x.court === 1)
                        const s2 = daySlots.find(x => x.time === time && x.court === 2)
                        const s3 = daySlots.find(x => x.time === time && x.court === 3)
                        const empty = !s1 && !s2 && !s3
                        const hasSlots = s1 || s2 || s3
                        const statuses = [s1?.status, s2?.status, s3?.status].filter(Boolean)
                        let weekColor = 'bg-surface/80 text-muted border-theme'
                        if (hasSlots) {
                          if (statuses.includes('payment_pending')) weekColor = 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          else if (statuses.includes('payment_approved')) weekColor = 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                          else if (statuses.includes('schedule_approved')) weekColor = 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                          else if (statuses.every(s => s === 'player_confirmed')) weekColor = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          else weekColor = 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        }
                        return (
                           <div key={d} className={`p-2.5 rounded-xl border text-[11px] font-bold text-center leading-snug ${weekColor}`}>
                            {empty ? (
                              canEdit ? <button onClick={() => { setAddSlot(true); setAddForm({ ...addForm, date: d, time }) }} className="text-lime-400 hover:underline">+ Add</button> : 'Available'
                            ) : (
                              <>
                                <span className="block">{[s1 && `C1: ${s1.player_text}`, s2 && `C2: ${s2.player_text}`, s3 && `C3: ${s3.player_text}`].filter(Boolean).join(' / ')}</span>
                                {(() => {
                                  const coachNames = [s1?.coach_name, s2?.coach_name, s3?.coach_name].filter(Boolean)
                                  return coachNames.length > 0 ? <span className="block text-[9px] text-amber-400 mt-0.5">{coachNames.join(', ')}</span> : null
                                })()}
                              </>
                            )}
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

      {activeTab === 'upload' && (
        <div className="glass-panel rounded-3xl p-6 border border-theme">
          <h3 className="font-heading font-extrabold text-theme text-lg mb-4">Upload Schedule</h3>
          <div className="space-y-4">
            {uploadMessage && (
              <div className={`p-3 rounded-xl text-sm font-semibold ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}>
                {uploadMessage.text}
              </div>
            )}
            <button onClick={async () => {
              try {
                const blob = await downloadFile('/imports/template/schedule')
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'schedule_import_template.xlsx'
                a.click()
                URL.revokeObjectURL(url)
              } catch {}
            }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              <Download className="w-4 h-4" /> Download Template
            </button>
            <div className="flex items-center gap-3">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setImportFile(e.target.files?.[0])} className="text-xs text-muted file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-lime-400 file:text-slate-950 file:cursor-pointer" />
              <button onClick={handleUploadFile} disabled={!importFile || importing} className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold disabled:opacity-50">
                {importing ? 'Uploading...' : 'Preview'}
              </button>
            </div>
            {importPreview && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted">Total: <strong className="text-theme">{importPreview.totalRows}</strong></span>
                  <span className="text-emerald-400">Valid: <strong>{importPreview.validRows}</strong></span>
                  {importPreview.errors.length > 0 && <span className="text-rose-400">Errors: <strong>{importPreview.errors.length}</strong></span>}
                </div>
                {importPreview.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {importPreview.errors.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-[11px] text-rose-400">Row {e.row}: {e.errors.join(', ')}</p>
                    ))}
                  </div>
                )}
                <button onClick={handleCommitImport} disabled={importPreview.validRows === 0} className="px-6 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold disabled:opacity-50">
                  Import {importPreview.validRows} Slots
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'conversions' && (
        <div className="glass-panel rounded-3xl p-6 border border-theme">
          <h3 className="font-heading font-extrabold text-theme text-lg mb-4">Conversion Requests</h3>
          {convLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : conversionRequests.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No conversion requests.</p>
          ) : (
            <div className="space-y-3">
              {conversionRequests.map(r => (
                <div key={r.id} className="p-4 rounded-2xl bg-surface/80 dark:bg-slate-900/80 border border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-bold text-theme">{r.user_name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === 'pending' ? 'bg-amber-400/20 text-amber-400' :
                        r.status === 'approved' ? 'bg-emerald-400/20 text-emerald-400' :
                        'bg-rose-400/20 text-rose-400'
                      }`}>{r.status}</span>
                    </div>
                    <p className="text-xs text-muted">
                      Convert {r.count} {r.from} → {r.to} ({r.from === 'private' ? r.count * 2 : r.count} {r.to} sessions)
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">{r.created_at?.slice(0, 16)}</p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleConvertAction(r.id, 'approve')} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Approve
                      </button>
                      <button onClick={() => handleConvertAction(r.id, 'reject')} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold border border-rose-500/20 hover:bg-rose-500/20">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {addSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme">Add Slot</h3>
              <button onClick={() => setAddSlot(null)} className="p-2 text-muted hover:text-theme hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase mb-1">Date</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm({ ...addForm, date: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase mb-1">Time</label>
                <select value={addForm.time} onChange={e => setAddForm({ ...addForm, time: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                  {ALL_TIMES.map(t => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase mb-1">Court</label>
                <select value={addForm.court} onChange={e => {
                  const court = parseInt(e.target.value)
                  const def = courtDefaults.find(cd => cd.court === court)
                  setAddForm({ ...addForm, court, coach_id: def?.coach_id || addForm.coach_id })
                }} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                  <option value={1}>Court 1</option>
                  <option value={2}>Court 2</option>
                  <option value={3}>Court 3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase mb-1">Player Name</label>
                <PlayerSearchInput value={addForm.player_text} onChange={val => setAddForm({ ...addForm, player_text: val })} onPlayerSelect={(p) => {
                setSelectedPlayer(p)
                const warn = checkPlayerBalance(p)
                if (warn) setBalanceWarning(warn)
              }} placeholder="e.g. Zain" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase mb-1">Session Type</label>
                <select value={addForm.session_type || ''} onChange={e => setAddForm({ ...addForm, session_type: e.target.value || null })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                  <option value="">None (Admin slot)</option>
                  <option value="private">Private</option>
                  <option value="group">Group</option>
                </select>
              </div>
              {addForm.session_type === 'group' && (
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase mb-1">Partner</label>
                  <PlayerSearchInput value={addPartner} onChange={setAddPartner} placeholder="e.g. Zain" />
                </div>
              )}
              {coaches.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase mb-1">Coach</label>
                  <select value={addForm.coach_id || ''} onChange={e => setAddForm({ ...addForm, coach_id: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                    <option value="">None</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setAddSlot(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={handleAddSlot} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm">Add</button>
            </div>
          </div>
        </div>
      )}

      {editSlot && (
        <EditSlotModal slot={editSlot} onClose={() => setEditSlot(null)} onSaved={() => { setEditSlot(null); fetchSlots() }} coaches={coaches} courtDefaults={courtDefaults} />
      )}

      {balanceWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${balanceWarning.type === 'blocked' ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}>
              {balanceWarning.type === 'blocked' ? (
                <span className="text-rose-400 text-2xl font-bold">!</span>
              ) : (
                <span className="text-amber-400 text-2xl font-bold">!</span>
              )}
            </div>
            <h3 className="text-lg font-bold text-theme mb-2">
              {balanceWarning.type === 'blocked' ? 'Player Blocked' : 'Low Balance Warning'}
            </h3>
            <p className="text-muted text-sm mb-4">
              {balanceWarning.type === 'blocked'
                ? `${balanceWarning.player} has been at 0 balance for ${balanceWarning.days} days. Admin cannot add this player to any slot.`
                : `${balanceWarning.player} has 0 balance (${balanceWarning.days} days since balance hit 0). You can still proceed for 2 weeks.`
              }
            </p>
            <div className="flex gap-3">
              {balanceWarning.type === 'warning' && (
                <button onClick={() => setBalanceWarning(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              )}
              <button onClick={() => setBalanceWarning(null)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${balanceWarning.type === 'blocked' ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'}`}>
                {balanceWarning.type === 'blocked' ? 'OK' : 'Proceed Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center bg-amber-500/20">
              <span className="text-amber-400 text-2xl font-bold">!</span>
            </div>
            <h3 className="text-lg font-bold text-theme mb-2">Insufficient Balance</h3>
            <p className="text-muted text-sm mb-4">
              {pendingOverride.player} has {pendingOverride.remaining} remaining {pendingOverride.sessionType} session(s), needs 1.
              Add this slot anyway as a <span className="text-lime-400 font-bold">free/bonus session</span>?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPendingOverride(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={() => handleOverrideConfirm('free')} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm">Add Free</button>
              <button onClick={() => handleOverrideConfirm('deduct')} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm">Deduct Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditSlotModal({ slot, onClose, onSaved, coaches, courtDefaults }) {
  const existingParts = (slot.player_text || '').split(/\s*\/\s*/)
  const [form, setForm] = useState({ player_text: existingParts[0] || '', date: slot.date, time: slot.time, court: slot.court, session_type: slot.session_type || null, coach_id: slot.coach_id || null })
  const [partner, setPartner] = useState(existingParts[1] || '')
  const [loading, setLoading] = useState(false)
  const [pendingOverride, setPendingOverride] = useState(null)

  const handleSave = async (balanceOverride) => {
    setLoading(true)
    try {
      const payload = { ...form }
      if (form.session_type === 'group' && partner.trim()) {
        payload.player_text = `${form.player_text} / ${partner.trim()}`
      }
      if (balanceOverride) payload.balanceOverride = balanceOverride
      await api.put(`/slots/${slot.id}`, payload)
      onSaved()
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('INSUFFICIENT_BALANCE') || msg.includes('409')) {
        const stype = form.session_type || 'private'
        setPendingOverride({
          player: form.player_text,
          sessionType: stype,
          remaining: 0,
        })
      } else {
        alert(err.message || 'Failed to save')
      }
    }
    setLoading(false)
  }

  const handleOverrideConfirm = async (mode) => {
    if (!pendingOverride) return
    const payload = { ...form }
    if (form.session_type === 'group' && partner.trim()) {
      payload.player_text = `${form.player_text} / ${partner.trim()}`
    }
    payload.balanceOverride = mode
    try {
      await api.put(`/slots/${slot.id}`, payload)
      setPendingOverride(null)
      onSaved()
    } catch (err) {
      alert(err.message || 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-theme">Edit Slot</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-theme hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-theme uppercase mb-1">Player Name</label>
            <PlayerSearchInput value={form.player_text} onChange={val => setForm({ ...form, player_text: val })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase mb-1">Session Type</label>
            {slot.booking_id ? (
              <div className="w-full px-3 py-2 rounded-xl bg-surface border-theme border border-theme text-muted text-xs">
                {form.session_type || 'Not set'} <span className="text-[10px]">(linked to booking)</span>
              </div>
            ) : (
              <select value={form.session_type || ''} onChange={e => setForm({ ...form, session_type: e.target.value || null })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                <option value="">None</option>
                <option value="private">Private</option>
                <option value="group">Group</option>
              </select>
            )}
          </div>
          {form.session_type === 'group' && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase mb-1">Partner</label>
              <PlayerSearchInput value={partner} onChange={setPartner} placeholder="e.g. Zain" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-theme uppercase mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase mb-1">Time</label>
            <select value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
              {ALL_TIMES.map(t => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase mb-1">Court</label>
            <select value={form.court} onChange={e => {
              const court = parseInt(e.target.value)
              const def = courtDefaults?.find(cd => cd.court === court)
              setForm({ ...form, court, coach_id: def?.coach_id || form.coach_id })
            }} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
              <option value={1}>Court 1</option>
              <option value={2}>Court 2</option>
              <option value={3}>Court 3</option>
            </select>
          </div>
          {coaches && coaches.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase mb-1">Coach</label>
              <select value={form.coach_id || ''} onChange={e => setForm({ ...form, coach_id: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs">
                <option value="">None</option>
                {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
          <button onClick={() => handleSave()} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {pendingOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center bg-amber-500/20">
              <span className="text-amber-400 text-2xl font-bold">!</span>
            </div>
            <h3 className="text-lg font-bold text-theme mb-2">Insufficient Balance</h3>
            <p className="text-muted text-sm mb-4">
              {pendingOverride.player} has {pendingOverride.remaining} remaining {pendingOverride.sessionType} session(s), needs 1.
              Add this slot anyway as a <span className="text-lime-400 font-bold">free/bonus session</span>?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPendingOverride(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={() => handleOverrideConfirm('free')} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm">Add Free</button>
              <button onClick={() => handleOverrideConfirm('deduct')} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm">Deduct Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
