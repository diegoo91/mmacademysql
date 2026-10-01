import { useState, useEffect } from 'react'
import { DollarSign, Plus, Trash2, Search, Check, X as XIcon, Users, UserPlus, Pencil } from 'lucide-react'
import { api } from '../../lib/api'
import { formatSlotTime } from '../../lib/time'
import { COURTS } from '../../data/siteConfig'
import { useFeedback } from '../../context/FeedbackContext'
import { useAllocationPreview } from '../../lib/allocation'
import { AllocationHint } from '../../components/AllocationHint'

const COURT_OPTIONS = Array.from({ length: COURTS }, (_, i) => i + 1)

const PAYMENT_STATUS_COLORS = {
  payment_pending: 'bg-amber-400/20 text-amber-400',
  payment_approved: 'bg-emerald-400/20 text-emerald-400',
  payment_rejected: 'bg-rose-400/20 text-rose-400',
}

const PAYMENT_STATUS_LABELS = {
  payment_pending: 'Pending Review',
  payment_approved: 'Approved',
  payment_rejected: 'Rejected',
}

const PAGE_SIZE = 25

export default function Payments() {
  const { confirm, toast } = useFeedback()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [guestRequests, setGuestRequests] = useState([])
  const [players, setPlayers] = useState([])
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    player_id: '',
    method: 'Cash',
    amount: '',
    private_sessions: '',
    group_sessions: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [countsTouched, setCountsTouched] = useState(false)
  // The amount drives the session counts (package priced on the server);
  // typing into the count fields switches to a manual override.
  const { allocation } = useAllocationPreview({ playerId: form.player_id, amount: form.amount })
  useEffect(() => {
    if (countsTouched || !allocation) return
    setForm(f => ({
      ...f,
      private_sessions: String(allocation.private_sessions ?? 0),
      group_sessions: String(allocation.group_sessions ?? 0),
    }))
  }, [allocation, countsTouched])
  useEffect(() => { if (showForm) setCountsTouched(false) }, [showForm])
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestForm, setGuestForm] = useState({
    guest_name: '', guest_phone: '', guest_email: '',
    sessionType: 'private', date: new Date().toISOString().slice(0, 10),
    time: '', court: '1',
  })
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      api.get('/payments'),
      api.get('/users'),
      api.get('/guest-booking-requests'),
    ])
      .then(([p, u, g]) => {
        setPayments(Array.isArray(p) ? p : [])
        setPlayers(Array.isArray(u) ? u.filter(x => x.role === 'player') : [])
        setGuestRequests(g.requests || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.player_id || !form.amount) return
    setSubmitting(true)
    try {
      const player = players.find(p => p.id === parseInt(form.player_id))
      // Untouched counts are omitted so the server derives them from the
      // amount (package priced, against the player's unpaid sessions).
      const body = { ...form, player_id: parseInt(form.player_id), player_name: player?.name || '' }
      if (!countsTouched) {
        delete body.private_sessions
        delete body.group_sessions
      }
      const res = await api.post('/payments', body)
      notifySettlement(res, form)
      setShowForm(false)
      setForm({ date: new Date().toISOString().slice(0, 10), player_id: '', method: 'Cash', amount: '', private_sessions: '', group_sessions: '', notes: '' })
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to create payment')
    }
    setSubmitting(false)
  }

  const handleApprove = async (id) => {
    try {
      const res = await api.put(`/payments/${id}/approve`)
      notifySettlement(res)
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to approve')
    }
  }

  // When a payment settled existing debt first, tell the admin exactly what
  // happened: offset first, remainder credited to this month's package.
  const notifySettlement = (res, formOverride) => {
    const s = res?.settlement
    if (!s || (!s.settled_private && !s.settled_group)) return
    const pSessions = res?.private_sessions ?? formOverride?.private_sessions ?? 0
    const gSessions = res?.group_sessions ?? formOverride?.group_sessions ?? 0
    const owed = [
      s.settled_private > 0 ? `${s.settled_private} private` : null,
      s.settled_group > 0 ? `${s.settled_group} group` : null,
    ].filter(Boolean).join(' + ')
    toast.success(
      `Payment recorded.\n\n` +
      `Paid: ${pSessions} private / ${gSessions} group\n` +
      `Offset existing debt first: ${owed}\n` +
      `Credited to this month's package: ${s.credited_private} private / ${s.credited_group} group`
    )
  }

  // Per-row balance effect: debt offset (if any) + what entered the cycle.
  const balanceEffect = (p) => {
    if (p.status !== 'payment_approved') return <span className="text-muted">—</span>
    const hasRecord = p.credited_private != null || p.credited_group != null
    const settled = (p.settled_private || 0) > 0 || (p.settled_group || 0) > 0
    const creditedP = hasRecord ? (p.credited_private || 0) : (p.private_sessions || 0)
    const creditedG = hasRecord ? (p.credited_group || 0) : (p.group_sessions || 0)
    const owed = [
      (p.settled_private || 0) > 0 ? `${p.settled_private}P` : '',
      (p.settled_group || 0) > 0 ? `${p.settled_group}G` : '',
    ].filter(Boolean).join(' ')
    return (
      <span className="whitespace-nowrap">
        {settled && (
          <span className="text-rose-400 font-bold" title={`Offset ${owed} of existing debt first`}>−{owed} debt</span>
        )}
        {settled && ' '}
        <span className="text-emerald-400 font-bold">+{creditedP}P / {creditedG}G</span>
      </span>
    )
  }

  const handleReject = async (id) => {
    const ok = await confirm({
      title: 'Reject this payment?',
      description: 'This will deny the linked booking.',
      confirmLabel: 'Reject payment',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.put(`/payments/${id}/reject`)
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to reject')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/payments/${deleteTarget.id}`)
      setDeleteTarget(null)
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    }
    setDeleting(false)
  }

  const handleGuestBooking = async (e) => {
    e.preventDefault()
    if (!guestForm.guest_name || !guestForm.time) return
    setGuestSubmitting(true)
    try {
      await api.post('/bookings/guest', {
        guest_name: guestForm.guest_name,
        guest_phone: guestForm.guest_phone,
        guest_email: guestForm.guest_email,
        sessionType: guestForm.sessionType,
        sessions: [{ date: guestForm.date, time: guestForm.time, court: parseInt(guestForm.court) }],
      })
      setShowGuestForm(false)
      setGuestForm({ guest_name: '', guest_phone: '', guest_email: '', sessionType: 'private', date: new Date().toISOString().slice(0, 10), time: '', court: '1' })
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to create guest booking')
    }
    setGuestSubmitting(false)
  }

  useEffect(() => {
    if (!deleteTarget) return
    const onKey = (e) => { if (e.key === 'Escape' && !deleting) setDeleteTarget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteTarget, deleting])

  const filtered = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.ref || '').toLowerCase().includes(q) ||
           (p.player_name || '').toLowerCase().includes(q) ||
           (p.notes || '').toLowerCase().includes(q)
  })

  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagePayments = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  const totalAmount = filtered.reduce((s, p) => s + (p.status === 'payment_approved' ? (p.amount || 0) : 0), 0)
  const totalPrivate = payments.reduce((s, p) => s + (p.private_sessions || 0), 0)
  const totalGroup = payments.reduce((s, p) => s + (p.group_sessions || 0), 0)
  const pendingCount = payments.filter(p => p.status === 'payment_pending').length
  const pendingAmount = payments.filter(p => p.status === 'payment_pending').reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Payments</h1>
          <p className="text-muted text-sm mt-1">Review payments, approve bookings, track session credits</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowForm(!showForm); setShowGuestForm(false) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 transition-colors text-sm font-bold">
            <Plus className="w-4 h-4" /> Add Payment
          </button>
          <button onClick={() => { setShowGuestForm(!showGuestForm); setShowForm(false) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25 transition-colors text-sm font-bold">
            <UserPlus className="w-4 h-4" /> Book for Guest
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Total Received</span>
          <p className="text-3xl font-black text-brand-text mt-1">EGP {totalAmount.toLocaleString()}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Private Sessions Credited</span>
          <p className="text-3xl font-black text-blue-400 mt-1">{totalPrivate}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Group Sessions Credited</span>
          <p className="text-3xl font-black text-purple-400 mt-1">{totalGroup}</p>
        </div>
      </div>

      {/* Add Payment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-panel rounded-2xl border border-theme p-6 space-y-4">
          <h3 className="text-lg font-bold text-theme">New Payment (Cash — entered manually)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Player *</label>
              <select value={form.player_id} onChange={e => setForm({ ...form, player_id: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                <option value="">Select player</option>
                {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Method *</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                <option value="Cash">Cash</option>
                <option value="Instapay">Instapay</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Amount (EGP) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Private Sessions</label>
              <input type="number" min="0" value={form.private_sessions} onChange={e => { setCountsTouched(true); setForm({ ...form, private_sessions: e.target.value }) }} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Group Sessions</label>
              <input type="number" min="0" value={form.group_sessions} onChange={e => { setCountsTouched(true); setForm({ ...form, group_sessions: e.target.value }) }} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
          </div>
          <AllocationHint allocation={countsTouched ? null : allocation} />
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 8 Group, 3 Private + 2 Group" className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-sm font-bold disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Payment'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-500/10 text-muted border border-theme text-sm font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Book for Guest Form */}
      {showGuestForm && (
        <form onSubmit={handleGuestBooking} className="glass-panel rounded-2xl border border-gold/40 p-6 space-y-4">
          <h3 className="text-lg font-bold text-gold flex items-center gap-2"><UserPlus className="w-5 h-5" /> Book for Guest (Walk-in)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Guest Name *</label>
              <input type="text" value={guestForm.guest_name} onChange={e => setGuestForm({ ...guestForm, guest_name: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Phone</label>
              <input type="text" value={guestForm.guest_phone} onChange={e => setGuestForm({ ...guestForm, guest_phone: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" placeholder="Phone number" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Email</label>
              <input type="email" value={guestForm.guest_email} onChange={e => setGuestForm({ ...guestForm, guest_email: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" placeholder="Email (optional)" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Session Type *</label>
              <select value={guestForm.sessionType} onChange={e => setGuestForm({ ...guestForm, sessionType: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                <option value="private">Private</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Date *</label>
              <input type="date" value={guestForm.date} onChange={e => setGuestForm({ ...guestForm, date: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Time *</label>
              <select value={guestForm.time} onChange={e => setGuestForm({ ...guestForm, time: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                <option value="">Select time</option>
                {['14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'].map(t => (
                  <option key={t} value={t}>{formatSlotTime(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Court *</label>
              <select value={guestForm.court} onChange={e => setGuestForm({ ...guestForm, court: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                {COURT_OPTIONS.map((c) => (
                  <option key={c} value={String(c)}>Court {c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={guestSubmitting} className="px-4 py-2 rounded-xl bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25 text-sm font-bold disabled:opacity-50">
              {guestSubmitting ? 'Booking...' : 'Confirm Guest Booking'}
            </button>
            <button type="button" onClick={() => setShowGuestForm(false)} className="px-4 py-2 rounded-xl bg-slate-500/10 text-muted border border-theme text-sm font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pending Alert */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-400/5 border border-amber-400/30 flex items-center justify-between">
          <span className="text-sm font-bold text-amber-400">
            {pendingCount} payment{pendingCount === 1 ? '' : 's'} pending review (EGP {pendingAmount.toLocaleString()}) — approve to credit balance and unlock schedule approval
          </span>
        </div>
      )}

      {/* Summary + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="glass-panel rounded-2xl px-5 py-3 border border-theme">
          <span className="text-xs font-semibold text-muted">Received (Filtered)</span>
          <span className="ml-3 text-lg font-black text-brand-text">EGP {totalAmount.toLocaleString()}</span>
          <span className="ml-2 text-xs text-muted">({filtered.length} payments)</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Search ref, player, notes..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
        </div>
      </div>

      {/* Payment History */}
      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="text-lg font-bold text-theme mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-brand-text" /> Payment History
        </h3>
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase">
                  <th className="text-left pb-3 font-semibold">Ref</th>
                  <th className="text-left pb-3 font-semibold">Date</th>
                  <th className="text-left pb-3 font-semibold">Player</th>
                  <th className="text-left pb-3 font-semibold">Method</th>
                  <th className="text-right pb-3 font-semibold">Amount</th>
                  <th className="text-left pb-3 font-semibold">Status</th>
                  <th className="text-left pb-3 font-semibold">Balance Effect</th>
                  <th className="text-left pb-3 font-semibold">Notes</th>
                  <th className="text-right pb-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme/60">
                {pagePayments.map(p => (
                  <tr key={p.id} className="hover:bg-white/30 dark:hover:bg-slate-800/30">
                    <td className="py-3 text-theme font-mono text-xs">{p.ref}</td>
                    <td className="py-3 text-theme">{p.date}</td>
                    <td className="py-3 text-theme font-medium">{p.player_name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.method === 'Cash'
                          ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                          : 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                      }`}>
                        {p.method}
                      </span>
                    </td>
                    <td className="py-3 text-right text-brand-text font-bold">EGP {(p.amount || 0).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PAYMENT_STATUS_COLORS[p.status] || ''}`}>
                        {PAYMENT_STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td className="py-3 text-xs">{balanceEffect(p)}</td>
                    <td className="py-3 text-muted text-xs max-w-[200px] truncate">{p.notes}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'payment_pending' && (
                          <>
                            <button onClick={() => handleApprove(p.id)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Approve & Credit Balance">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleReject(p.id)} className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Reject Payment">
                              <XIcon className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => setEditTarget(p)} aria-label={`Edit payment${p.ref ? ` ${p.ref}` : ''}`} className="p-1 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(p)} aria-label={`Delete payment${p.ref ? ` ${p.ref}` : ''}`} className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-theme">
            <span className="text-xs text-muted">Showing {rangeStart}–{rangeEnd} of {filtered.length} payments</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className="px-3 py-1.5 rounded-lg border border-theme text-theme text-xs font-bold hover:border-brand-text/50 disabled:opacity-40">Prev</button>
              <span className="text-xs font-bold text-theme">Page {safePage} of {totalPages}</span>
              <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className="px-3 py-1.5 rounded-lg border border-theme text-theme text-xs font-bold hover:border-brand-text/50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Guest Booking Requests */}
      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-gold" /> Guest Booking Requests ({guestRequests.length})
        </h3>
        {guestRequests.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">No guest booking requests.</p>
        ) : (
          <div className="space-y-3">
            {guestRequests.map(r => {
              const payload = (() => { try { return JSON.parse(r.payload) } catch { return {} } })()
              return (
                <div key={r.id} className="flex items-start justify-between px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50">
                  <div>
                    <span className="font-semibold text-theme text-sm">{payload.guest_name}</span>
                    <span className="text-muted text-xs ml-2">{payload.guest_phone}</span>
                    <div className="text-[10px] text-muted mt-1">
                      {payload.preferred_date && <span>{payload.preferred_date} </span>}
                      {payload.preferred_time && <span>{payload.preferred_time} </span>}
                      {payload.preferred_court && <span>Court {payload.preferred_court} </span>}
                      <span className="uppercase font-bold">{payload.session_type || 'private'}</span>
                      {payload.notes && <span className="ml-2 italic">- {payload.notes}</span>}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    r.status === 'pending' ? 'bg-amber-400/15 text-amber-400' :
                    r.status === 'approved' ? 'bg-emerald-400/15 text-emerald-400' :
                    'bg-rose-400/15 text-rose-400'
                  }`}>{r.status}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit payment modal */}
      {editTarget && (
        <EditPaymentModal
          payment={editTarget}
          players={players}
          onClose={() => setEditTarget(null)}
          onSaved={(res) => { setEditTarget(null); notifySettlement(res); fetchData() }}
        />
      )}

      {/* Delete payment consequence modal */}
      {deleteTarget && (() => {
        const t = deleteTarget
        const hasRecord = t.credited_private != null || t.credited_group != null
        const credP = hasRecord ? (t.credited_private || 0) : (t.private_sessions || 0)
        const credG = hasRecord ? (t.credited_group || 0) : (t.group_sessions || 0)
        const setP = t.settled_private || 0
        const setG = t.settled_group || 0
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-payment-title" onClick={() => { if (!deleting) setDeleteTarget(null) }}>
            <div className="bg-surface border border-theme rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 id="delete-payment-title" className="text-lg font-bold text-theme mb-1">Delete Payment?</h3>
              <p className="text-xs text-muted mb-4 font-mono">Ref: {t.ref || '—'}</p>
              <ul className="text-sm text-muted space-y-1.5 mb-6">
                <li>Player: <span className="font-semibold text-theme">{t.player_name || '—'}</span></li>
                {t.amount != null && <li>Amount: <span className="font-semibold text-theme">{t.amount} EGP</span></li>}
                {credP + credG > 0 && <li>Remaining credited sessions removed: <span className="font-semibold text-rose-400">−{credP}P / −{credG}G</span></li>}
                {setP + setG > 0 && <li>Debt settled by this payment is reinstated: <span className="font-semibold text-rose-400">+{setP}P / +{setG}G</span></li>}
                <li className="text-rose-600 dark:text-rose-400 font-semibold">This cannot be undone.</li>
              </ul>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete payment'}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function EditPaymentModal({ payment, players, onClose, onSaved }) {
  const { toast } = useFeedback()
  const [saving, setSaving] = useState(false)
  const [countsTouched, setCountsTouched] = useState(false)
  const [form, setForm] = useState({
    date: payment.date || '',
    player_id: payment.player_id != null ? String(payment.player_id) : '',
    method: payment.method || 'Cash',
    amount: String(payment.amount ?? ''),
    private_sessions: String(payment.private_sessions ?? 0),
    group_sessions: String(payment.group_sessions ?? 0),
    notes: payment.notes || '',
  })
  const isApproved = payment.status === 'payment_approved'
  const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text'
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  // Amount drives the counts (excludes this payment so its own credit can't
  // pay for the sessions it covers); typing a count switches to manual.
  const { allocation } = useAllocationPreview({ playerId: form.player_id, amount: form.amount, excludeId: payment.id })
  useEffect(() => {
    if (countsTouched || !allocation) return
    setForm(f => ({
      ...f,
      private_sessions: String(allocation.private_sessions ?? 0),
      group_sessions: String(allocation.group_sessions ?? 0),
    }))
  }, [allocation, countsTouched])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const playerId = form.player_id ? parseInt(form.player_id) : null
      const body = {
        date: form.date,
        player_id: playerId,
        player_name: playerId ? (players.find(p => p.id === playerId)?.name || payment.player_name) : payment.player_name,
        method: form.method,
        amount: form.amount,
        notes: form.notes,
      }
      // Untouched counts are omitted → the server re-derives them from the
      // amount (package priced, against the player's unpaid sessions).
      if (countsTouched) {
        body.private_sessions = form.private_sessions
        body.group_sessions = form.group_sessions
      }
      const res = await api.put(`/payments/${payment.id}`, body)
      onSaved(res)
    } catch (err) {
      toast.error(err.message || 'Failed to update payment')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-payment-title" onClick={() => { if (!saving) onClose() }}>
      <div className="bg-surface border border-theme rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 id="edit-payment-title" className="text-lg font-bold text-theme mb-1">Edit Payment</h3>
        <p className="text-xs text-muted mb-4 font-mono">Ref: {payment.ref || '—'} · Status: {PAYMENT_STATUS_LABELS[payment.status] || payment.status}</p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Date</label>
            <input type="date" value={form.date} onChange={set('date')} required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Player</label>
            <select value={form.player_id} onChange={set('player_id')} className={inputCls}>
              <option value="">— None (no balance credit) —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted mb-1">Method</label>
              <select value={form.method} onChange={set('method')} className={inputCls}>
                <option value="Cash">Cash</option>
                <option value="Instapay">Instapay</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1">Amount (EGP)</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted mb-1">Private sessions</label>
              <input type="number" min="0" value={form.private_sessions} onChange={(e) => { setCountsTouched(true); set('private_sessions')(e) }} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1">Group sessions</label>
              <input type="number" min="0" value={form.group_sessions} onChange={(e) => { setCountsTouched(true); set('group_sessions')(e) }} className={inputCls} />
            </div>
          </div>
          <AllocationHint allocation={countsTouched ? null : allocation} />
          <div>
            <label className="block text-xs font-bold text-muted mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls + ' resize-none'} />
          </div>

          {isApproved && (
            <p className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              This payment is already credited. The amount re-prices the session counts against the player{"'"}s unpaid sessions (package priced); changing the player, counts, or amount reverses the old credit and applies the new one. Status changes are done via Approve/Reject.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
