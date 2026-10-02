import { useState, useEffect } from 'react'
import { CalendarOff, Check, Clock, Plus, Trash2, UserCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useFeedback } from '../../context/FeedbackContext'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const emptyDraft = () => DAYS.map(() => ({ on: false, start_time: '15:00', end_time: '23:00' }))

export default function CoachesAvailability({ data, onChanged, canManage }) {
  const { toast } = useFeedback()
  const coaches = data?.coaches || []
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [offDate, setOffDate] = useState('')
  const [offNote, setOffNote] = useState('')

  const selected = coaches.find(c => c.id === selectedId) || null

  useEffect(() => {
    if (!selected) { setDraft(emptyDraft()); return }
    setDraft(DAYS.map((_, i) => {
      const w = selected.weekly.find(x => Number(x.weekday) === i)
      return w
        ? { on: true, start_time: w.start_time, end_time: w.end_time }
        : { on: false, start_time: '15:00', end_time: '23:00' }
    }))
    setOffDate(''); setOffNote('')
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const restrictedCount = (c) => (c.weekly?.length || 0) > 0 ? `${c.weekly.length} working day${c.weekly.length === 1 ? '' : 's'}` : 'Any day'
  const offCount = (c) => c.dates?.length || 0

  const saveWeekly = async () => {
    if (!selected || !canManage) return
    for (const [i, r] of draft.entries()) {
      if (r.on && r.end_time <= r.start_time) {
        toast.error(`${DAYS[i]}: end time must be after start time`)
        return
      }
    }
    setSaving(true)
    try {
      const weekly = draft
        .map((r, i) => r.on ? { weekday: i, start_time: r.start_time, end_time: r.end_time } : null)
        .filter(Boolean)
      await api.put(`/coach-availability/${selected.id}`, { weekly })
      toast.success('Availability saved')
      onChanged()
    } catch (err) {
      toast.error(err.message || 'Failed to save availability')
    }
    setSaving(false)
  }

  const clearWeekly = async () => {
    if (!selected || !canManage) return
    setSaving(true)
    try {
      await api.put(`/coach-availability/${selected.id}`, { weekly: [] })
      toast.success('Restrictions cleared — coach is now available any time')
      onChanged()
    } catch (err) {
      toast.error(err.message || 'Failed to clear availability')
    }
    setSaving(false)
  }

  const addDayOff = async () => {
    if (!selected || !canManage) return
    if (!offDate) { toast.error('Pick a date first'); return }
    try {
      await api.post(`/coach-availability/${selected.id}/dates`, { date: offDate, note: offNote.trim() || undefined })
      setOffDate(''); setOffNote('')
      toast.success('Day off added')
      onChanged()
    } catch (err) {
      toast.error(err.message || 'Failed to add day off')
    }
  }

  const removeDayOff = async (id) => {
    if (!canManage) return
    try {
      await api.del(`/coach-availability/dates/${id}`)
      onChanged()
    } catch (err) {
      toast.error(err.message || 'Failed to remove day off')
    }
  }

  const anyRestricted = draft.some(r => r.on)

  if (coaches.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-8 border border-theme text-center">
        <UserCheck className="w-10 h-10 mx-auto text-muted mb-3" />
        <h3 className="font-heading font-extrabold text-theme text-lg mb-1">No coach users yet</h3>
        <p className="text-sm text-muted">Create users with the Coach role (Admin → Users) to manage their availability here.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
      {/* Coach list */}
      <div className="glass-panel rounded-3xl border border-theme p-3 space-y-1.5">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted px-2 pt-1 pb-2">Coaches</p>
        {coaches.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${selectedId === c.id ? 'bg-brand/10 border-brand-text/40' : 'bg-surface border-theme hover:border-brand-text/30'}`}
          >
            <span className="block text-xs font-bold text-theme">{c.name}</span>
            <span className="flex items-center gap-2 mt-1 text-[10px] font-bold">
              <span className={c.weekly.length ? 'text-amber-400' : 'text-emerald-400'}>{restrictedCount(c)}</span>
              {offCount(c) > 0 && <span className="text-rose-400">{offCount(c)} day{offCount(c) === 1 ? '' : 's'} off</span>}
            </span>
          </button>
        ))}
      </div>

      {/* Editor */}
      {!selected ? (
        <div className="glass-panel rounded-3xl p-8 border border-theme text-center">
          <Clock className="w-9 h-9 mx-auto text-muted mb-3" />
          <p className="text-sm text-muted">Select a coach to edit their weekly hours and days off.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl border border-theme p-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-heading font-extrabold text-theme text-lg">{selected.name}</h3>
              <p className="text-[11px] text-muted">
                {anyRestricted ? 'Only the enabled windows below are bookable.' : 'No weekly restrictions — available any day and time.'}
              </p>
            </div>
            <div className="flex gap-2">
              {anyRestricted && canManage && (
                <button onClick={clearWeekly} disabled={saving} className="px-3 py-2 rounded-xl bg-surface border border-theme text-muted text-[11px] font-bold hover:text-theme disabled:opacity-50">
                  Clear restrictions
                </button>
              )}
              <button onClick={saveWeekly} disabled={saving || !canManage} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-[11px] font-bold disabled:opacity-50 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save hours'}
              </button>
            </div>
          </div>

          {/* Weekly hours */}
          <div className="rounded-2xl border border-theme overflow-hidden divide-y divide-theme">
            {DAYS.map((day, i) => {
              const row = draft[i]
              return (
                <div key={day} className={`flex items-center gap-3 px-4 py-2.5 ${row.on ? 'bg-brand/5' : 'bg-surface'}`}>
                  <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.on}
                      disabled={!canManage}
                      onChange={e => setDraft(draft.map((r, j) => j === i ? { ...r, on: e.target.checked } : r))}
                      className="accent-brand"
                    />
                    <span className={`text-xs font-bold ${row.on ? 'text-theme' : 'text-muted'}`}>{day}</span>
                  </label>
                  {row.on ? (
                    <div className="flex items-center gap-2">
                      <input type="time" value={row.start_time} disabled={!canManage} onChange={e => setDraft(draft.map((r, j) => j === i ? { ...r, start_time: e.target.value } : r))} className="px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-bold" />
                      <span className="text-muted text-xs">→</span>
                      <input type="time" value={row.end_time} disabled={!canManage} onChange={e => setDraft(draft.map((r, j) => j === i ? { ...r, end_time: e.target.value } : r))} className="px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-bold" />
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-rose-400/80">Off</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Days off */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-2">Days off (overrides weekly hours)</p>
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Date</label>
                <input type="date" value={offDate} disabled={!canManage} onChange={e => setOffDate(e.target.value)} className="px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-bold" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[10px] font-bold text-muted mb-1">Note (optional)</label>
                <input type="text" value={offNote} disabled={!canManage} maxLength={200} placeholder="e.g. travel day" onChange={e => setOffNote(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs" />
              </div>
              <button onClick={addDayOff} disabled={!canManage} className="px-3 py-2 rounded-xl bg-brand/10 border border-brand-text/40 text-brand-text text-[11px] font-bold hover:bg-brand/20 flex items-center gap-1 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {selected.dates.length === 0 ? (
              <p className="text-[11px] text-muted">No days off set.</p>
            ) : (
              <div className="space-y-1.5">
                {selected.dates.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/5 border border-rose-500/20">
                    <span className="flex items-center gap-2 text-xs font-bold text-theme">
                      <CalendarOff className="w-3.5 h-3.5 text-rose-400" />
                      {d.date}
                      {d.note && <span className="text-muted font-normal">— {d.note}</span>}
                    </span>
                    {canManage && (
                      <button onClick={() => removeDayOff(d.id)} title="Remove" className="p-1 text-rose-400 hover:text-rose-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!canManage && (
            <p className="text-[11px] font-bold text-amber-400">Read-only — only admins can change coach availability.</p>
          )}
        </div>
      )}
    </div>
  )
}
