import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, DollarSign, Download, Edit, Gift, History, Key, LayoutDashboard, Lock, Mail, Phone, Plus, Settings2, Shield, Trash2, TrendingUp, Unlock, Wallet, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { giftUnpaidSessions, confirmGift } from '../../lib/gift'
import { formatSlotTime, formatDateMed } from '../../lib/time'
import { useAuth } from '../../context/AuthContext'
import { useFeedback } from '../../context/FeedbackContext'
import { useEscapeKey } from '../../lib/hooks'
import { useAllocationPreview } from '../../lib/allocation'
import { AllocationHint } from '../../components/AllocationHint'
import { UserModal, ConvertModal, HistoryModal, TransferModal } from './Users'
import { JourneyTab } from '../../components/Journey'

function BalanceControlModal({ user, onClose, onDone }) {
  const { confirm, prompt } = useFeedback()
  const [form, setForm] = useState({
    cycle_private: user.cycle_private ?? 0,
    cycle_group: user.cycle_group ?? 0,
    cycle_expires_at: user.cycle_expires_at ? String(user.cycle_expires_at).slice(0, 10) : '',
    private_balance: user.legacy_private ?? user.private_balance ?? 0,
    group_balance: user.legacy_group ?? user.group_balance ?? 0,
  })
  const [loading, setLoading] = useState(false)
  const [expireLoading, setExpireLoading] = useState(false)
  const [writeOffLoading, setWriteOffLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMsg('')
    try {
      await api.post(`/users/${user.id}/balance`, {
        cycle_private: parseInt(form.cycle_private, 10) || 0,
        cycle_group: parseInt(form.cycle_group, 10) || 0,
        cycle_expires_at: form.cycle_expires_at ? `${form.cycle_expires_at}T23:59:59` : null,
        private_balance: parseInt(form.private_balance, 10) || 0,
        group_balance: parseInt(form.group_balance, 10) || 0,
      })
      setMsg('Saved for this player.')
      onDone()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  const expireNow = async () => {
    const ok = await confirm({
      title: 'Expire package now?',
      description: `Expire this player's monthly package now? Unused this-month sessions will be zeroed.`,
      confirmLabel: 'Expire now',
      tone: 'danger',
    })
    if (!ok) return
    setExpireLoading(true)
    setError('')
    setMsg('')
    try {
      await api.post(`/users/${user.id}/balance`, { expire_now: true })
      setMsg('Package expired for this player.')
      onDone()
    } catch (err) {
      setError(err.message || 'Expire failed')
    } finally {
      setExpireLoading(false)
    }
  }

  const writeOff = async () => {
    const reason = await prompt({
      title: `Write off negative balance for ${user.name}?`,
      description: `Current debt: ${user.debt_private} private / ${user.debt_group} group. A reason is required (it is audit-logged).`,
      label: 'Reason',
      placeholder: 'e.g. Month-start write-off',
      confirmLabel: 'Write off debt',
      tone: 'danger',
    })
    if (reason === null) return
    if (!reason.trim()) { setError('A reason is required to write off debt.'); return }
    setWriteOffLoading(true)
    setError('')
    setMsg('')
    try {
      await api.post(`/users/${user.id}/writeoff`, { reason: reason.trim() })
      setMsg('Negative balance written off as a gift.')
      onDone()
    } catch (err) {
      setError(err.message || 'Write-off failed')
    } finally {
      setWriteOffLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="balance-control-title" onClick={onClose}>
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 id="balance-control-title" className="text-xl font-bold text-theme">Balance Control</h3>
            <p className="text-xs text-muted mt-0.5">One player only — {user.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        {msg && <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">{msg}</div>}

        <form onSubmit={submit} className="space-y-5">
          <div className="p-4 rounded-xl bg-surface border border-theme">
            <p className="text-xs font-bold text-brand-text uppercase tracking-wider mb-3">This month's package</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Private</label>
                <input type="number" min="0" value={form.cycle_private} onChange={e => setForm({ ...form, cycle_private: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-950/40 border border-theme text-theme text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Group</label>
                <input type="number" min="0" value={form.cycle_group} onChange={e => setForm({ ...form, cycle_group: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-950/40 border border-theme text-theme text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-muted mb-1">Package expires</label>
              <input type="date" value={form.cycle_expires_at} onChange={e => setForm({ ...form, cycle_expires_at: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-950/40 border border-theme text-theme text-sm" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-theme">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Carryover (never expires)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Private</label>
                <input type="number" min="0" value={form.private_balance} onChange={e => setForm({ ...form, private_balance: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-950/40 border border-theme text-theme text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Group</label>
                <input type="number" min="0" value={form.group_balance} onChange={e => setForm({ ...form, group_balance: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-950/40 border border-theme text-theme text-sm" />
              </div>
            </div>
          </div>

          {(user.debt_private > 0 || user.debt_group > 0) && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">Negative balance (debt)</p>
              <p className="text-xs text-muted mb-3">Current debt: <span className="font-black text-rose-400">{user.debt_private}P · {user.debt_group}G</span> — forgive it as a gift from the academy (reason required, audit-logged).</p>
              <button
                type="button"
                onClick={writeOff}
                disabled={writeOffLoading}
                className="w-full py-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 text-sm font-bold disabled:opacity-50"
              >
                {writeOffLoading ? 'Writing off…' : 'Write off negative balance (gift)'}
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
          <button
            type="button"
            onClick={expireNow}
            disabled={expireLoading || (!user.cycle_private && !user.cycle_group && !user.cycle_expires_at)}
            className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-sm font-bold disabled:opacity-40"
          >
            {expireLoading ? 'Expiring…' : 'Expire package now'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({ user, onClose, onDone }) {
  useEscapeKey(onClose)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    method: 'Cash',
    amount: '',
    private_sessions: '',
    group_sessions: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [countsTouched, setCountsTouched] = useState(false)
  // Amount drives the session counts (package priced against unpaid sessions);
  // typing into the count fields switches to a manual override.
  const { allocation } = useAllocationPreview({ playerId: user.id, amount: form.amount })
  useEffect(() => {
    if (countsTouched || !allocation) return
    setForm(f => ({
      ...f,
      private_sessions: String(allocation.private_sessions ?? 0),
      group_sessions: String(allocation.group_sessions ?? 0),
    }))
  }, [allocation, countsTouched])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount) return
    setSubmitting(true)
    setError('')
    try {
      const body = { ...form, player_id: user.id, player_name: user.name, amount: parseFloat(form.amount) }
      if (!countsTouched) {
        delete body.private_sessions
        delete body.group_sessions
      }
      await api.post('/payments', body)
      onDone()
    } catch (err) {
      setError(err.message || 'Failed to create payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="modal-title-0">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 id="modal-title-0" className="text-xl font-bold text-theme flex items-center gap-2"><DollarSign className="w-5 h-5 text-brand-text" /> Add Payment</h3>
            <p className="text-xs text-muted mt-1">For {user.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-theme hover:bg-surface rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Method *</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
                <option value="Cash">Cash (credits immediately)</option>
                <option value="Instapay">Instapay (pending approval)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Amount (EGP) *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Private Sessions</label>
              <input type="number" min="0" value={form.private_sessions} onChange={e => { setCountsTouched(true); setForm({ ...form, private_sessions: e.target.value }) }} placeholder="0" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Group Sessions</label>
              <input type="number" min="0" value={form.group_sessions} onChange={e => { setCountsTouched(true); setForm({ ...form, group_sessions: e.target.value }) }} placeholder="0" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
          </div>
          <AllocationHint allocation={countsTouched ? null : allocation} />
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 3 Private + 2 Group" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
          </div>
          <p className="text-[11px] text-muted">Cash payments credit balances immediately. Instapay payments stay pending until approved on the Payments page.</p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { confirm, prompt, toast } = useFeedback()
  const canEdit = hasPermission('users')
  const canPay = hasPermission('dashboard')
  const canConvert = hasPermission('conversions')
  const [user, setUser] = useState(null)
  const [report, setReport] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(true)
  const [error, setError] = useState('')
  const [allPlayers, setAllPlayers] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetResult, setResetResult] = useState(null)
  const [lockConfirm, setLockConfirm] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [gifting, setGifting] = useState(false)
  const [tab, setTab] = useState('overview')

  useEscapeKey(() => {
    setDeleteConfirm(false)
    setResetConfirm(false)
    setLockConfirm(false)
    setResetResult(null)
  }, deleteConfirm || resetConfirm || lockConfirm || resetResult)

  const fetchUser = () => {
    setLoading(true)
    api.get(`/users/${id}`).then(setUser).catch(err => setError(err.message || 'Failed to load user')).finally(() => setLoading(false))
  }

  const fetchReport = () => {
    api.get(`/users/${id}/report`).then(setReport).catch(() => setReport(null)).finally(() => setReportLoading(false))
  }

  const fetchPayments = () => {
    if (!canPay) return
    api.get('/payments').then(data => {
      const arr = Array.isArray(data) ? data : []
      setPayments(arr.filter(p => p.player_id === parseInt(id)))
    }).catch(() => {})
  }

  const refreshPlayer = () => {
    fetchUser()
    fetchReport()
    fetchPayments()
  }

  const unpaidSessions = (report?.sessions || []).filter(s => !s.paid)
  const unpaidPrivate = unpaidSessions.filter(s => s.session_type !== 'group').length
  const unpaidGroup = unpaidSessions.filter(s => s.session_type === 'group').length

  const handleGiftUnpaid = async () => {
    if (gifting) return
    const ok = await confirmGift(confirm, {
      playerName: user?.name || 'this player',
      priv: unpaidPrivate,
      grp: unpaidGroup,
      amountOwed: report?.amount_owed,
    })
    if (!ok) return
    setGifting(true)
    try {
      await giftUnpaidSessions({
        playerId: user.user_id ?? user.id,
        playerName: user.name,
        unpaidPrivate,
        unpaidGroup,
      })
      refreshPlayer()
    } catch (err) {
      toast.error(err.message || 'Gift failed')
    } finally {
      setGifting(false)
    }
  }

  useEffect(() => { fetchUser() }, [id])

  useEffect(() => {
    if (user?.role !== 'player') { setReportLoading(false); return }
    setReportLoading(true)
    fetchReport()
  }, [id, user?.role])

  useEffect(() => {
    fetchPayments()
    if (!canConvert) return
    api.get('/users').then(data => {
      const arr = Array.isArray(data) ? data : data.users || []
      setAllPlayers(arr.filter(u => u.role === 'player'))
    }).catch(() => {})
  }, [id, canConvert])

  const handleDownloadPDF = async () => {
    if (!report) return
    const { generateReceiptPDF } = await import('../../lib/receiptPDF')
    const doc = generateReceiptPDF(report)
    doc.save(`receipt_${(user?.name || '').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const handleDelete = async () => {
    try { await api.del(`/users/${id}`); navigate('/admin/users') } catch (err) { toast.error(err.message || 'Delete failed') }
  }

  const handleResetPassword = async () => {
    try {
      const data = await api.post(`/users/${id}/reset-password`)
      setResetConfirm(false)
      setResetResult(data)
    } catch (err) { toast.error(err.message || 'Reset failed') }
  }

  const handleToggleStatus = async () => {
    const newStatus = (user.account_status || 'active') === 'active' ? 'locked' : 'active'
    try {
      await api.patch(`/users/${id}/account-status`, { status: newStatus })
      setLockConfirm(false)
      fetchUser()
    } catch (err) { toast.error(err.message || 'Status update failed') }
  }

  const handleWriteOff = async () => {
    const debtP = user.debt_private ?? 0
    const debtG = user.debt_group ?? 0
    if (!debtP && !debtG) return
    const reason = await prompt({
      title: `Write off negative balance for ${user.name}?`,
      description: `Current debt: ${debtP} private / ${debtG} group. A reason is required (it is audit-logged).`,
      label: 'Reason',
      defaultValue: 'Month-start write-off',
      confirmLabel: 'Write off debt',
      tone: 'danger',
    })
    if (reason === null) return
    if (!reason.trim()) { toast.error('A reason is required.'); return }
    try {
      await api.post(`/users/${id}/writeoff`, { reason: reason.trim() })
      refreshPlayer()
    } catch (err) {
      toast.error(err.message || 'Write-off failed')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="text-center py-20">
        <p className="text-rose-400 text-sm mb-4">{error || 'User not found'}</p>
        <Link to="/admin/users" className="text-brand-text font-bold hover:underline">Back to Users</Link>
      </div>
    )
  }

  const isPlayer = user.role === 'player'
  const sessions = report?.sessions || []
  const isLocked = (user.account_status || 'active') === 'active'
  const amountOwed = report?.amount_owed || 0
  const totalPaid = payments.reduce((s, p) => s + (p.status === 'payment_approved' ? (p.amount || 0) : 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/users" className="p-2 rounded-xl bg-surface border border-theme text-muted hover:text-theme transition-colors" title="Back to Users">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-14 h-14 rounded-full bg-brand/20 text-brand-text flex items-center justify-center font-black text-xl border border-brand-text/30">
            {user.name?.charAt(0)}
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-black text-theme">{user.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand-text font-bold border border-brand-text/20">
                <Shield className="w-3 h-3" /> {user.role}
              </span>
              {user.member_code && <span className="font-mono font-bold text-brand-text">#{user.member_code}</span>}
              <span>Joined {formatDateMed(user.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button onClick={() => setEditOpen(true)} className="px-4 py-2 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 hover:bg-brand/20 text-sm font-bold flex items-center gap-2">
              <Edit className="w-4 h-4" /> Edit
            </button>
          )}
          {canPay && isPlayer && (
            <button onClick={() => setPaymentOpen(true)} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Payment
            </button>
          )}
          {canEdit && isPlayer && (
            <button onClick={() => setBalanceOpen(true)} className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover text-sm font-bold flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Balance Control
            </button>
          )}
          {canConvert && isPlayer && (
            <button onClick={() => setConvertOpen(true)} className="px-4 py-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30 hover:bg-amber-400/20 text-sm font-bold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 rotate-45" /> Convert
            </button>
          )}
          {canConvert && isPlayer && (
            <button onClick={() => setTransferOpen(true)} className="px-4 py-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30 hover:bg-amber-400/20 text-sm font-bold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" /> Transfer
            </button>
          )}
          {isPlayer && (
            <button onClick={() => setHistoryOpen(true)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
              <History className="w-4 h-4" /> Sessions
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={() => setResetConfirm(true)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800" title="Reset Password">
                <Key className="w-4 h-4" />
              </button>
              <button onClick={() => setLockConfirm(true)} className={`px-4 py-2 rounded-xl border text-sm font-semibold flex items-center gap-2 ${isLocked ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'}`} title={isLocked ? 'Lock Account' : 'Unlock Account'}>
                {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
              <button onClick={() => setDeleteConfirm(true)} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-sm font-bold flex items-center gap-2" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Email</span>
          <p className="text-sm font-bold text-theme mt-1 flex items-center gap-2 break-all">
            <Mail className="w-4 h-4 text-brand-text shrink-0" /> {user.email}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Phone</span>
          <p className="text-sm font-bold text-theme mt-1 flex items-center gap-2">
            <Phone className="w-4 h-4 text-brand-text shrink-0" /> {user.phone || '—'}
          </p>
        </div>
        {isPlayer && (
          <>
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Skill / Position</span>
              <p className="text-sm font-bold text-theme mt-1">
                {user.skill_level || '—'}{user.position ? ` · ${user.position}` : ''}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Date of Birth</span>
              <p className="text-sm font-bold text-theme mt-1">{user.dob || '—'}</p>
            </div>
          </>
        )}
        {!isPlayer && (
          <div className="glass-panel rounded-2xl p-5 border border-theme sm:col-span-2">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Notes</span>
            <p className="text-sm text-theme mt-1">{user.notes || '—'}</p>
          </div>
        )}
      </div>

      {isPlayer && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`glass-panel rounded-2xl p-5 border ${amountOwed > 0 ? 'border-amber-400/40 bg-amber-400/5' : 'border-theme'}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-amber-400/10"><DollarSign className="w-5 h-5 text-amber-400" /></div>
                <span className="text-xs font-bold text-muted uppercase">Amount Owed</span>
              </div>
              <p className={`font-heading text-3xl font-black ${amountOwed > 0 ? 'text-amber-400' : 'text-theme'}`}>
                EGP {amountOwed.toLocaleString()}
              </p>
              {amountOwed > 0 && canPay && (
                <button onClick={() => setPaymentOpen(true)} className="mt-3 w-full px-3 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Collect Payment
                </button>
              )}
              {amountOwed > 0 && canPay && unpaidSessions.length > 0 && (
                <button onClick={handleGiftUnpaid} disabled={gifting} className="mt-2 w-full px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50">
                  <Gift className="w-3.5 h-3.5" /> {gifting ? 'Gifting…' : `Gift Unpaid at 0 EGP (${unpaidPrivate}P + ${unpaidGroup}G)`}
                </button>
              )}
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-emerald-400/10"><DollarSign className="w-5 h-5 text-emerald-400" /></div>
                <span className="text-xs font-bold text-muted uppercase">Total Paid (Approved)</span>
              </div>
              <p className="font-heading text-3xl font-black text-theme">EGP {totalPaid.toLocaleString()}</p>
              <p className="text-[10px] text-muted mt-2">{payments.length} payment{payments.length !== 1 ? 's' : ''} on record</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-theme text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-brand/10"><ArrowRightLeft className="w-5 h-5 text-brand-text" /></div>
                <span className="text-xs font-bold text-muted uppercase">Remaining Private / Group</span>
              </div>
              <p className="font-heading text-3xl font-black">
                <span className="text-brand-text">{user.private_balance ?? 0}P</span>
                <span className="text-muted"> · </span>
                <span className="text-purple-400">{user.group_balance ?? 0}G</span>
              </p>
              <p className="text-[10px] text-muted mt-2">1P = 2G · this month {user.cycle_private ?? 0}P / {user.cycle_group ?? 0}G</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme w-fit" role="tablist" aria-label="Player sections">
            {[
              { id: 'overview', label: 'Overview', icon: LayoutDashboard },
              { id: 'balances', label: 'Balances', icon: Wallet },
              { id: 'sessions', label: 'Sessions', icon: History },
              { id: 'journey', label: 'Journey', icon: TrendingUp },
              ...(canPay ? [{ id: 'payments', label: 'Payments', icon: DollarSign }] : []),
            ].map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${tab === t.id ? 'bg-brand text-white shadow-md' : 'text-muted hover:text-theme'}`}>
                <t.icon className="w-4 h-4" /><span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'overview' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: 'Used Sessions', value: user.used_sessions ?? 0, cls: 'text-brand-text' },
              { label: 'Used Private', value: user.used_private ?? 0, cls: 'text-blue-400' },
              { label: 'Used Group', value: user.used_group ?? 0, cls: 'text-purple-400' },
              { label: 'This Month Private', value: user.cycle_private ?? 0, cls: 'text-brand-text' },
            ].map(s => (
              <div key={s.label} className="glass-panel rounded-2xl p-4 border border-theme text-center">
                <p className={`font-heading text-2xl font-black ${s.cls}`}>{s.value}</p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1 font-semibold">{s.label}</p>
              </div>
            ))}
          </div>
          )}

          {tab === 'balances' && (
          <div className="glass-panel rounded-2xl p-5 border border-theme">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-brand/10"><History className="w-5 h-5 text-brand-text" /></div>
              <span className="text-xs font-bold text-muted uppercase">Balances</span>
            </div>
            <div className="space-y-1.5 mt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Private remaining</span>
                <span className="font-black text-brand-text">{user.private_balance ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Group remaining</span>
                <span className="font-black text-purple-400">{user.group_balance ?? 0}</span>
              </div>
              {(user.group_from_private ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Available as group</span>
                  <span className="font-black text-purple-400">{(user.group_balance ?? 0) + user.group_from_private}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-theme pt-1.5 mt-1.5">
                <span className="text-muted">This month P / G</span>
                <span className="font-black text-brand-text">{user.cycle_private ?? 0} / {user.cycle_group ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Carryover P / G</span>
                <span className="font-black text-muted">{user.legacy_private ?? 0} / {user.legacy_group ?? 0}</span>
              </div>
              {(user.debt_private > 0 || user.debt_group > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-rose-400 font-semibold">Negative balance (owed)</span>
                  <span className="font-black text-rose-400">{user.debt_private}P · {user.debt_group}G</span>
                </div>
              )}
              {user.cycle_expires_at && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Package expires</span>
                  <span className="font-bold text-amber-400">{formatDateMed(user.cycle_expires_at)}</span>
                </div>
              )}
            </div>
            {canEdit && (user.debt_private > 0 || user.debt_group > 0) && (
              <button onClick={handleWriteOff} className="mt-3 w-full px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-bold flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Write off negative balance
              </button>
            )}
          </div>
          )}
        </>
      )}

      {isPlayer && tab === 'journey' && (
        <JourneyTab userId={id} />
      )}

      {isPlayer && tab === 'overview' && user.notes && (
        <div className="glass-panel rounded-2xl p-5 border border-theme">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Notes</span>
          <p className="text-sm text-theme mt-1">{user.notes}</p>
        </div>
      )}

      {isPlayer && canPay && tab === 'payments' && (
        <div className="glass-panel rounded-2xl border border-theme p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-brand-text" /> Payment History
            </h3>
            <button onClick={() => setPaymentOpen(true)} className="px-3 py-1.5 rounded-lg bg-brand/10 text-brand-text text-xs font-bold hover:bg-brand/20 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Payment
            </button>
          </div>
          {payments.length === 0 && (
            <p className="text-sm text-muted text-center py-6">No payments yet.</p>
          )}
          {payments.length > 0 && (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-muted uppercase">
                  <th className="text-left px-3 py-2 font-semibold">Ref</th>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Method</th>
                  <th className="text-right px-3 py-2 font-semibold">Amount</th>
                  <th className="text-center px-3 py-2 font-semibold">Private</th>
                  <th className="text-center px-3 py-2 font-semibold">Group</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {payments.map(p => (
                  <tr key={p.id} className="text-theme">
                    <td className="px-3 py-2.5 font-mono">{p.ref}</td>
                    <td className="px-3 py-2.5">{p.date}</td>
                    <td className="px-3 py-2.5">{p.method}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand-text">EGP {(p.amount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center">{p.private_sessions || 0}</td>
                    <td className="px-3 py-2.5 text-center">{p.group_sessions || 0}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.status === 'payment_approved' ? 'bg-emerald-400/15 text-emerald-400' :
                        p.status === 'payment_pending' ? 'bg-amber-400/15 text-amber-400' :
                        'bg-rose-400/15 text-rose-400'
                      }`}>
                        {p.status === 'payment_pending' ? 'Pending' : p.status === 'payment_approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted max-w-[160px] truncate">{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {isPlayer && tab === 'sessions' && (
        <div className="glass-panel rounded-2xl border border-theme p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-extrabold text-theme text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-brand-text" /> Session History
            </h3>
            <div className="flex items-center gap-2">
              {amountOwed > 0 && (
                <span className="px-3 py-1 rounded-full bg-amber-400/10 text-amber-400 text-xs font-bold">
                  EGP {amountOwed.toLocaleString()} owed
                </span>
              )}
              {amountOwed > 0 && (
                <button onClick={handleDownloadPDF} className="px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-400 text-xs font-bold hover:bg-amber-400/20 flex items-center gap-1">
                  <Download className="w-3 h-3" /> Receipt PDF
                </button>
              )}
            </div>
          </div>
          {reportLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No sessions yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-muted uppercase">
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Time</th>
                    <th className="text-left px-3 py-2 font-semibold">Court</th>
                    <th className="text-left px-3 py-2 font-semibold">Type</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-center px-3 py-2 font-semibold">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {sessions.map((s, i) => (
                    <tr key={i} className="text-theme">
                      <td className="px-3 py-2.5">{s.date}</td>
                        <td className="px-3 py-2.5 font-mono">{formatSlotTime(s.time)}</td>
                      <td className="px-3 py-2.5">Court {s.court}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${s.session_type === 'group' ? 'bg-purple-400/20 text-purple-400' : 'bg-blue-400/20 text-blue-400'}`}>
                          {s.session_type || 'private'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{s.status || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {s.paid ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">Paid</span>
                        ) : (
                          <span className="text-amber-400 text-[10px] font-bold">Unpaid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editOpen && (
        <UserModal
          user={user}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); refreshPlayer() }}
        />
      )}
      {balanceOpen && isPlayer && (
        <BalanceControlModal
          user={user}
          onClose={() => setBalanceOpen(false)}
          onDone={() => refreshPlayer()}
        />
      )}
      {convertOpen && (
        <ConvertModal
          user={user}
          onClose={() => setConvertOpen(false)}
          onDone={() => { setConvertOpen(false); refreshPlayer() }}
        />
      )}
      {historyOpen && <HistoryModal user={user} onClose={() => setHistoryOpen(false)} />}
      {transferOpen && (
        <TransferModal
          player={user}
          onClose={() => { setTransferOpen(false); refreshPlayer() }}
          allPlayers={allPlayers}
        />
      )}
      {paymentOpen && (
        <PaymentModal
          user={user}
          onClose={() => setPaymentOpen(false)}
          onDone={() => { setPaymentOpen(false); refreshPlayer() }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="modal-title-1">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 id="modal-title-1" className="text-lg font-bold text-theme mb-2">Delete User?</h3>
            <p className="text-muted text-sm mb-6">Are you sure you want to delete {user.name}? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="modal-title-2">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <Key className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 id="modal-title-2" className="text-lg font-bold text-theme mb-2">Reset Password?</h3>
            <p className="text-muted text-sm mb-6">A temporary password will be generated for {user.name}. They will be required to change it on next login.</p>
            <div className="flex gap-3">
              <button onClick={() => setResetConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={handleResetPassword} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold">Reset</button>
            </div>
          </div>
        </div>
      )}

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="modal-title-3">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-brand-text mx-auto mb-4" />
            <h3 id="modal-title-3" className="text-lg font-bold text-theme mb-2">Password Reset</h3>
            <p className="text-muted text-sm mb-2">Temporary password:</p>
            <code className="block p-3 rounded-xl bg-surface border border-theme text-brand-text font-mono text-lg font-bold mb-4">{resetResult.tempPassword}</code>
            <p className="text-muted text-xs mb-4">Share this password securely. The user will be forced to change it on next login.</p>
            <button onClick={() => setResetResult(null)} className="w-full py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm">Done</button>
          </div>
        </div>
      )}

      {lockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="modal-title-4">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            {isLocked ? <Lock className="w-12 h-12 text-rose-400 mx-auto mb-4" /> : <Unlock className="w-12 h-12 text-emerald-400 mx-auto mb-4" />}
            <h3 id="modal-title-4" className="text-lg font-bold text-theme mb-2">{isLocked ? 'Lock Account?' : 'Unlock Account?'}</h3>
            <p className="text-muted text-sm mb-6">
              {isLocked
                ? `${user.name} will not be able to log in until you unlock their account.`
                : `Restore ${user.name}'s access to the platform.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setLockConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={handleToggleStatus} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold ${isLocked ? 'bg-rose-500 hover:bg-rose-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}>
                {isLocked ? 'Lock' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
