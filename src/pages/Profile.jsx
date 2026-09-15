import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Clock, Mail, Phone, Shield, ArrowRightLeft, Calendar, Trophy, CheckCircle, XCircle, Key } from 'lucide-react'
import { api, fileUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PlayerSearchInput from '../components/PlayerSearchInput'

export default function Profile() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', skill_level: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [showResultModal, setShowResultModal] = useState(false)
  const [pendingResultsCount, setPendingResultsCount] = useState(0)
  const [mySlots, setMySlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  const fetchMySlots = () => {
    if (!user) return
    setSlotsLoading(true)
    // Fetch all slots and filter to this player's slots that need action
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 30)
    const to = new Date(today)
    to.setDate(today.getDate() + 30)
    api.get(`/slots?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`)
      .then(data => {
        const name = (user.name || '').toLowerCase()
        const mine = (Array.isArray(data) ? data : []).filter(s => {
          const matchesUser = s.user_id === user.id
          const matchesName = name && s.player_text && s.player_text.split(/\s*\/\s*/)[0].trim().toLowerCase() === name
          if (!matchesUser && !matchesName) return false
          return ['schedule_approved', 'payment_pending', 'payment_approved', 'player_confirmed'].includes(s.status)
        })
        setMySlots(mine)
      })
      .catch(() => {})
      .finally(() => setSlotsLoading(false))
  }

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    setForm({ name: user.name || '', phone: user.phone || '', skill_level: user.skill_level || 'Intermediate' })
    api.get('/bookings')
      .then(data => setBookings(data.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false))
    api.get('/results?limit=200')
      .then(data => {
        const pending = (data.results || []).filter(r => r.status === 'pending' && r.submitted_by === user.id)
        setPendingResultsCount(pending.length)
      })
      .catch(() => {})
    fetchMySlots()
  }, [user])

  const handleConfirmSlot = async (slotId) => {
    try {
      await api.put(`/slots/${slotId}/confirm`)
      fetchMySlots()
    } catch (err) {
      alert(err.message || 'Failed to confirm')
    }
  }

  const handleDeclineSlot = async (slotId) => {
    try {
      await api.put(`/slots/${slotId}/decline`)
      fetchMySlots()
    } catch (err) {
      alert(err.message || 'Failed to submit decline request')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const updated = await api.put('/auth/profile', form)
      setUser(updated)
      setEditing(false)
      setMsg('Profile updated!')
    } catch (err) {
      setMsg(err.message || 'Failed to update')
    }
    setSaving(false)
  }

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const data = await api.upload('/auth/avatar', fd)
      setUser({ ...user, avatar: data.avatar })
    } catch {}
  }

  const handlePasswordChange = async () => {
    setPwSaving(true)
    setPwMsg('')
    try {
      if (!pwForm.currentPassword || !pwForm.newPassword) {
        setPwMsg('Both fields are required')
        setPwSaving(false)
        return
      }
      if (pwForm.newPassword.length < 8) {
        setPwMsg('New password must be at least 8 characters')
        setPwSaving(false)
        return
      }
      if (pwForm.newPassword !== pwForm.confirmPassword) {
        setPwMsg('Passwords do not match')
        setPwSaving(false)
        return
      }
      await api.post('/auth/change-password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      setPwMsg('Password changed successfully!')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPasswordChange(false)
    } catch (err) {
      setPwMsg(err.message || 'Failed to change password')
    }
    setPwSaving(false)
  }

  const totalPrivateRemaining = user.private_balance || 0
  const totalGroupRemaining = user.group_balance || 0
  const hasCredits = totalPrivateRemaining > 0 || totalGroupRemaining > 0

  const visibleBookings = user?.role === 'player'
    ? bookings.filter(b => b.status !== 'cancelled' && b.status !== 'denied')
    : bookings

  const statusColors = {
    payment_pending: 'bg-amber-400/20 text-amber-400',
    payment_approved: 'bg-blue-400/20 text-blue-400',
    schedule_approved: 'bg-purple-400/20 text-purple-400',
    player_confirmed: 'bg-emerald-400/20 text-emerald-400',
    cancelled: 'bg-rose-400/20 text-rose-400',
    denied: 'bg-rose-400/20 text-rose-400',
  }

  const statusLabels = {
    payment_pending: 'Payment Pending',
    payment_approved: 'Payment Approved',
    schedule_approved: 'Awaiting Confirmation',
    player_confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    denied: 'Denied',
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Card */}
        <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-lime-400/60 bg-surface">
                {user.avatar ? (
                  <img src={fileUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lime-400 text-3xl font-bold">
                    {user.name?.charAt(0)}
                  </div>
                )}
              </div>
              <label className="absolute inset-0 flex items-center justify-center bg-slate-50/60 dark:bg-slate-950/60 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="w-6 h-6 text-lime-400" />
                <input type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
              </label>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="font-heading text-2xl font-black text-theme">{user.name}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2 text-sm text-muted">
                <span className="flex items-center gap-1"><Mail className="w-4 h-4 text-lime-400" />{user.email}</span>
                {user.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4 text-lime-400" />{user.phone}</span>}
                <span className="flex items-center gap-1"><Shield className="w-4 h-4 text-lime-400" />{user.role}</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                <span className="px-2.5 py-1 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-bold">
                  {user.skill_level || 'Intermediate'}
                </span>
                <span className="text-xs text-muted">Member since {user.member_since || new Date().getFullYear()}</span>
              </div>
            </div>

            <button onClick={() => setEditing(!editing)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
          </div>

          {editing && (
            <div className="space-y-4 pt-4 border-t border-theme max-w-md">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Skill Level</label>
                <select value={form.skill_level} onChange={e => setForm({ ...form, skill_level: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
              {msg && <p className={`text-xs ${msg.includes('updated') ? 'text-emerald-400' : 'text-rose-400'}`}>{msg}</p>}
              <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm transition-all disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-extrabold text-theme flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" /> Change Password
            </h2>
            {!showPasswordChange && (
              <button onClick={() => { setShowPasswordChange(true); setPwMsg('') }} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">
                Change
              </button>
            )}
          </div>
          {showPasswordChange ? (
            <div className="space-y-4 max-w-sm">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Current Password</label>
                <input type="password" value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">New Password (min 8 characters)</label>
                <input type="password" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} minLength={8} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} minLength={8} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
              </div>
              {pwMsg && <p className={`text-xs ${pwMsg.includes('success') ? 'text-emerald-400' : 'text-rose-400'}`}>{pwMsg}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowPasswordChange(false); setPwMsg('') }} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
                <button onClick={handlePasswordChange} disabled={pwSaving} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm transition-all disabled:opacity-50">
                  {pwSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            pwMsg && <p className={`text-xs ${pwMsg.includes('success') ? 'text-emerald-400' : 'text-rose-400'}`}>{pwMsg}</p>
          )}
        </div>

        {/* Session Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: mySlots.length },
            { label: 'Confirmed', value: mySlots.filter(s => s.status === 'player_confirmed').length },
            { label: 'Awaiting Confirmation', value: mySlots.filter(s => s.status === 'schedule_approved').length },
            { label: 'Pending', value: mySlots.filter(s => ['payment_pending', 'payment_approved'].includes(s.status)).length },
          ].map((stat, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 text-center bg-white/60 dark:bg-slate-900/60">
              <div className="font-heading text-3xl font-black text-lime-400">{stat.value}</div>
              <div className="text-xs font-semibold text-muted mt-1 uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* My Slots Awaiting Action */}
        {user?.role === 'player' && (
          <MySlotsPanel
            slots={mySlots}
            loading={slotsLoading}
            onConfirm={handleConfirmSlot}
            onDecline={handleDeclineSlot}
          />
        )}

        {/* Session Credits */}
        <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8">
            <h2 className="font-heading text-xl font-extrabold text-theme mb-4 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-400" /> Remaining Session Credits
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface/80 border border-theme text-center">
                <div className="font-heading text-3xl font-black text-lime-400">{totalPrivateRemaining}</div>
                <div className="text-xs font-semibold text-muted mt-1 uppercase tracking-wider">Private Sessions</div>
              </div>
              <div className="p-4 rounded-2xl bg-surface/80 border border-theme text-center">
                <div className="font-heading text-3xl font-black text-purple-400">{totalGroupRemaining}</div>
                <div className="text-xs font-semibold text-muted mt-1 uppercase tracking-wider">Group Sessions</div>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-3 text-center">1 Private session = 2 Group sessions.</p>
            <ConversionRequestButton privateRemaining={totalPrivateRemaining} groupRemaining={totalGroupRemaining} />
          </div>

        {/* Booking History */}
        <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8">
          <h2 className="font-heading text-xl font-extrabold text-theme mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-lime-400" /> Booking History
          </h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : visibleBookings.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No bookings yet. <Link to="/book" className="text-lime-400 font-bold hover:underline">Book a session</Link></p>
          ) : (
            <div className="space-y-3">
              {visibleBookings.map(b => {
                let sessionCount = 0
                try { sessionCount = JSON.parse(b.sessions_json).length } catch {}
                return (
                  <div key={b.id} className="p-4 rounded-2xl bg-surface/80 border border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm font-bold text-lime-400">{b.ref}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[b.status] || ''}`}>
                          {statusLabels[b.status] || b.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted capitalize">{b.session_type} — {sessionCount} session{sessionCount === 1 ? '' : 's'} — {Number(b.total).toLocaleString()} EGP</p>
                      <p className="text-[11px] text-muted mt-0.5">{b.created_at?.slice(0, 10)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {user?.role === 'player' && (
            <div className="mt-6 pt-4 border-t border-theme space-y-3">
              {pendingResultsCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold text-center">
                  You have {pendingResultsCount} pending result{pendingResultsCount === 1 ? '' : 's'} awaiting confirmation
                </div>
              )}
              <button onClick={() => setShowResultModal(true)} className="w-full py-3.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-lime-400/20">
                <Trophy className="w-4 h-4" />
                Submit Match Result
              </button>
              <Link
                to={hasCredits ? '/schedule?mine=1' : '/book'}
                className="w-full py-3.5 rounded-xl bg-surface border border-theme text-theme font-extrabold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {hasCredits ? 'Book Session from Schedule' : 'Book a New Session'}
              </Link>
            </div>
          )}
        </div>
      </div>
      {showResultModal && (
        <PlayerResultModal user={user} onClose={() => setShowResultModal(false)} onSaved={() => { setShowResultModal(false); setPendingResultsCount(c => c + 1) }} />
      )}
    </div>
  )
}

function ConversionRequestButton({ privateRemaining, groupRemaining }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ from: 'private', count: 1 })
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    setSending(true)
    setMsg('')
    try {
      const to = form.from === 'private' ? 'group' : 'private'
      await api.post('/conversion-requests', { from: form.from, to, count: parseInt(form.count) })
      setMsg('Request sent! Admin will review shortly.')
      setOpen(false)
    } catch (err) {
      setMsg(err.message || 'Failed to send request')
    }
    setSending(false)
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl bg-surface border border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/10 transition-all flex items-center justify-center gap-2">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Request Credit Conversion
        </button>
      ) : (
        <div className="p-4 rounded-xl bg-surface/80 border border-purple-500/20 space-y-3">
          <div className="flex gap-2">
            {privateRemaining > 0 && (
              <button onClick={() => setForm({ ...form, from: 'private' })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.from === 'private' ? 'bg-purple-500 text-white border-purple-500' : 'bg-surface border-theme text-theme'}`}>
                Private → Group
              </button>
            )}
            {groupRemaining >= 2 && (
              <button onClick={() => setForm({ ...form, from: 'group' })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.from === 'group' ? 'bg-purple-500 text-white border-purple-500' : 'bg-surface border-theme text-theme'}`}>
                Group → Private
              </button>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase mb-1">
              {form.from === 'private' ? 'Private sessions to convert' : 'Group sessions to convert (÷2)'}
            </label>
            <input type="number" min={1} max={form.from === 'private' ? privateRemaining : Math.floor(groupRemaining / 2)} value={form.count} onChange={e => setForm({ ...form, count: parseInt(e.target.value) || 1 })} className="w-full px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs" />
          </div>
          <p className="text-[11px] text-center text-slate-400">
            {form.from === 'private' ? `→ +${form.count * 2} group sessions` : `→ +${form.count} private sessions`}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 py-2 rounded-lg bg-surface border border-theme text-theme text-xs font-semibold">Cancel</button>
            <button onClick={handleSubmit} disabled={sending} className="flex-1 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold disabled:opacity-50">
              {sending ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      )}
      {msg && <p className={`text-[11px] mt-2 text-center ${msg.includes('sent') ? 'text-emerald-400' : 'text-rose-400'}`}>{msg}</p>}
    </div>
  )
}

function PlayerResultModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    format: 'short',
    sideA: [user?.name || ''],
    sideB: [''],
    score_a: '',
    score_b: '',
    court: 1,
    competition: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scoreA = Number(form.score_a) || 0
  const scoreB = Number(form.score_b) || 0
  const scoresFilled = form.score_a !== '' && form.score_b !== ''
  const tie = scoresFilled && scoreA === scoreB

  const updateSide = (side, idx, value) => {
    const arr = [...form[side]]
    arr[idx] = value
    setForm({ ...form, [side]: arr })
  }

  const addPlayer = (side) => {
    if (form[side].length < 2) setForm({ ...form, [side]: [...form[side], ''] })
  }

  const removePlayer = (side, idx) => {
    if (form[side].length > 1) setForm({ ...form, [side]: form[side].filter((_, i) => i !== idx) })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/results', {
        date: form.date,
        format: form.format,
        sideA: form.sideA.map(s => s.trim()).filter(Boolean),
        sideB: form.sideB.map(s => s.trim()).filter(Boolean),
        score_a: scoreA,
        score_b: scoreB,
        court: form.court,
        competition: form.competition,
        notes: form.notes,
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = form.date && form.sideA[0]?.trim() && form.sideB[0]?.trim() && scoresFilled && !tie

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">Submit Match Result</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">&times;</button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Court</label>
              <select value={form.court} onChange={e => setForm({ ...form, court: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                <option value={1}>Court 1</option>
                <option value={2}>Court 2</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Format *</label>
            <div className="flex gap-2">
              {[{ v: 'short', l: 'Short Set' }, { v: 'long', l: 'Long Set' }, { v: 'tiebreak', l: 'Tiebreak' }].map(o => (
                <button key={o.v} type="button" onClick={() => setForm({ ...form, format: o.v })}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${form.format === o.v ? 'bg-lime-400 text-slate-950 border-lime-400' : 'bg-surface border-theme text-theme hover:border-lime-400'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-lime-400 uppercase tracking-wider">Side A *</label>
              {form.sideA.map((name, i) => (
                <div key={i} className="flex gap-1">
                  <div className="flex-1">
                    <PlayerSearchInput value={name} onChange={val => updateSide('sideA', i, val)} placeholder="Player name" />
                  </div>
                  {form.sideA.length > 1 && <button type="button" onClick={() => removePlayer('sideA', i)} className="px-2 text-rose-400 hover:text-rose-300">&times;</button>}
                </div>
              ))}
              {form.sideA.length < 2 && <button type="button" onClick={() => addPlayer('sideA')} className="text-[10px] font-bold text-lime-400 hover:text-lime-300">+ Add Partner</button>}
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider">Side B *</label>
              {form.sideB.map((name, i) => (
                <div key={i} className="flex gap-1">
                  <div className="flex-1">
                    <PlayerSearchInput value={name} onChange={val => updateSide('sideB', i, val)} placeholder="Opponent name" />
                  </div>
                  {form.sideB.length > 1 && <button type="button" onClick={() => removePlayer('sideB', i)} className="px-2 text-rose-400 hover:text-rose-300">&times;</button>}
                </div>
              ))}
              {form.sideB.length < 2 && <button type="button" onClick={() => addPlayer('sideB')} className="text-[10px] font-bold text-rose-400 hover:text-rose-300">+ Add Opponent</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Score A *</label>
              <input type="number" min="0" value={form.score_a} onChange={e => setForm({ ...form, score_a: e.target.value === '' ? '' : parseInt(e.target.value) })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Score B *</label>
              <input type="number" min="0" value={form.score_b} onChange={e => setForm({ ...form, score_b: e.target.value === '' ? '' : parseInt(e.target.value) })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
          </div>
          {scoresFilled && (
            <div className={`p-3 rounded-xl text-center text-sm font-bold ${tie ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              {tie ? 'Scores cannot be tied' : <>Winner: <span className="text-lime-400">{scoreA > scoreB ? form.sideA[0] : form.sideB[0]}</span></>}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Competition</label>
            <input type="text" value={form.competition} onChange={e => setForm({ ...form, competition: e.target.value })} placeholder="e.g. League, Tournament" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400 resize-none" />
          </div>
          <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold text-center">
            Player submissions require admin confirmation before appearing in reports.
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={loading || !canSubmit} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" /> : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MySlotsPanel({ slots, loading, onConfirm, onDecline }) {
  if (loading) return null
  if (slots.length === 0) return null

  const scheduleApproved = slots.filter(s => s.status === 'schedule_approved')
  const paymentPending = slots.filter(s => s.status === 'payment_pending')
  const paymentApproved = slots.filter(s => s.status === 'payment_approved')
  const playerConfirmed = slots.filter(s => s.status === 'player_confirmed')

  return (
    <div className="glass-panel rounded-3xl border border-theme p-6 sm:p-8">
      <h2 className="font-heading text-xl font-extrabold text-theme mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-lime-400" /> My Schedule
      </h2>

      {scheduleApproved.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-xs font-bold text-purple-400 uppercase">Awaiting Your Confirmation ({scheduleApproved.length})</p>
          {scheduleApproved.map(slot => (
            <div key={slot.id} className="p-4 rounded-2xl bg-purple-400/5 border border-purple-400/20">
              <p className="text-sm font-bold text-theme mb-1">
                {slot.session_type === 'group' ? 'Group' : 'Private'} Session
              </p>
              <p className="text-xs text-muted mb-3">
                {slot.date} at {slot.time} — Court {slot.court}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirm(slot.id)}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Yes, I'll attend
                </button>
                <button
                  onClick={() => onDecline(slot.id)}
                  className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" /> Can't make it
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paymentApproved.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs font-bold text-blue-400 uppercase">Payment Approved — Awaiting Schedule Approval ({paymentApproved.length})</p>
          {paymentApproved.map(slot => (
            <div key={slot.id} className="p-3 rounded-xl bg-blue-400/5 border border-blue-400/20 text-xs text-muted">
              {slot.date} at {slot.time} — Court {slot.court} — {slot.session_type || 'session'}
            </div>
          ))}
        </div>
      )}

      {paymentPending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-400 uppercase">Payment Pending Review ({paymentPending.length})</p>
          {paymentPending.map(slot => (
            <div key={slot.id} className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/20 text-xs text-muted">
              {slot.date} at {slot.time} — Court {slot.court} — {slot.session_type || 'session'}
            </div>
          ))}
        </div>
      )}

      {playerConfirmed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-emerald-400 uppercase">Confirmed Sessions ({playerConfirmed.length})</p>
          {playerConfirmed.sort((a, b) => b.date.localeCompare(a.date)).map(slot => (
            <div key={slot.id} className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/20 text-xs text-muted flex justify-between items-center">
              <span>{slot.date} at {slot.time} — Court {slot.court} — {slot.session_type || 'session'}</span>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
