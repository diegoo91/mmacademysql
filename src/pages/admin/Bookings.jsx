import { useState, useEffect } from 'react'
import { DollarSign, Plus, Trash2, Search, Check, X as XIcon } from 'lucide-react'
import { api } from '../../lib/api'

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

export default function Bookings() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
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

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      api.get('/payments'),
      api.get('/users'),
    ])
      .then(([p, u]) => {
        setPayments(Array.isArray(p) ? p : [])
        setPlayers(Array.isArray(u) ? u.filter(x => x.role === 'player') : [])
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
      await api.post('/payments', {
        ...form,
        player_id: parseInt(form.player_id),
        player_name: player?.name || '',
      })
      setShowForm(false)
      setForm({ date: new Date().toISOString().slice(0, 10), player_id: '', method: 'Cash', amount: '', private_sessions: '', group_sessions: '', notes: '' })
      fetchData()
    } catch (err) {
      alert(err.message || 'Failed to create payment')
    }
    setSubmitting(false)
  }

  const handleApprove = async (id) => {
    try {
      await api.put(`/payments/${id}/approve`)
      fetchData()
    } catch (err) {
      alert(err.message || 'Failed to approve')
    }
  }

  const handleReject = async (id) => {
    if (!confirm('Reject this payment? This will deny the linked booking.')) return
    try {
      await api.put(`/payments/${id}/reject`)
      fetchData()
    } catch (err) {
      alert(err.message || 'Failed to reject')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this payment? Balance credits will be reversed if approved.')) return
    try {
      await api.del(`/payments/${id}`)
      fetchData()
    } catch (err) {
      alert(err.message || 'Failed to delete')
    }
  }

  const filtered = payments.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.ref || '').toLowerCase().includes(q) ||
           (p.player_name || '').toLowerCase().includes(q) ||
           (p.notes || '').toLowerCase().includes(q)
  })

  const totalAmount = filtered.reduce((s, p) => s + (p.amount || 0), 0)
  const pendingCount = payments.filter(p => p.status === 'payment_pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Payments</h1>
          <p className="text-muted text-sm mt-1">Review payments, approve bookings</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lime-500/10 text-lime-400 border border-lime-500/30 hover:bg-lime-500/20 transition-colors text-sm font-bold">
          <Plus className="w-4 h-4" /> Add Payment
        </button>
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
                {players.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Method *</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm">
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Amount (EGP) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Private Sessions</label>
              <input type="number" min="0" value={form.private_sessions} onChange={e => setForm({ ...form, private_sessions: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Group Sessions</label>
              <input type="number" min="0" value={form.group_sessions} onChange={e => setForm({ ...form, group_sessions: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 8 Group, 3 Private + 2 Group" className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-lime-500/10 text-lime-400 border border-lime-500/30 hover:bg-lime-500/20 text-sm font-bold disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Payment'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-500/10 text-muted border border-theme text-sm font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pending Alert */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-400/5 border border-amber-400/30 flex items-center justify-between">
          <span className="text-sm font-bold text-amber-400">
            {pendingCount} payment{pendingCount === 1 ? '' : 's'} pending review — approve to credit balance and unlock schedule approval
          </span>
        </div>
      )}

      {/* Summary + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="glass-panel rounded-2xl px-5 py-3 border border-theme">
          <span className="text-xs font-semibold text-muted">Total Filtered</span>
          <span className="ml-3 text-lg font-black text-lime-400">EGP {totalAmount.toLocaleString()}</span>
          <span className="ml-2 text-xs text-muted">({filtered.length} payments)</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Search ref, player, notes..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
        </div>
      </div>

      {/* Payment History */}
      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="text-lg font-bold text-theme mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-lime-400" /> Payment History
        </h3>
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
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
                  <th className="text-left pb-3 font-semibold">Notes</th>
                  <th className="text-right pb-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme/60">
                {filtered.map(p => (
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
                    <td className="py-3 text-right text-lime-400 font-bold">EGP {(p.amount || 0).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PAYMENT_STATUS_COLORS[p.status] || ''}`}>
                        {PAYMENT_STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
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
                        <button onClick={() => handleDelete(p.id)} className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
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
      </div>
    </div>
  )
}
