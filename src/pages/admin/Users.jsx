import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, CheckCircle2, Download, FileUp, Lock, Plus, Search, Shield, Unlock, Upload, X } from 'lucide-react'
import { api, downloadFile } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export function ConvertModal({ user, onClose, onDone }) {
  const [from, setFrom] = useState('private')
  const [count, setCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Conversion only operates on legacy carryover columns (not cycle package).
  const priv = user.legacy_private ?? user.private_balance ?? 0
  const grp = user.legacy_group ?? user.group_balance ?? 0
  const fromPriv = from === 'private'
  const available = fromPriv ? priv : grp
  const needed = fromPriv ? count : count * 2
  const resultPriv = fromPriv ? priv - count : priv + count
  const resultGrp = fromPriv ? grp + count * 2 : grp - count * 2
  const insufficient = needed > available

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/users/${user.id}/convert`, { from, count })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">Convert Balances — {user.name}</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-theme hover:bg-surface rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Convert from</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFrom('private')} className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${fromPriv ? 'bg-brand/15 text-brand-text border-brand-text/40' : 'bg-surface text-muted border-theme'}`}>
                Private ({priv})
              </button>
              <button onClick={() => setFrom('group')} className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${!fromPriv ? 'bg-purple-400/15 text-purple-400 border-purple-400/40' : 'bg-surface text-muted border-theme'}`}>
                Group ({grp})
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">
              {fromPriv ? 'Private sessions to convert' : 'Group sessions to convert'}
            </label>
            <input type="number" min="1" value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
          </div>
          {insufficient && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
              Insufficient balance. {fromPriv ? `Need ${needed} private, have ${available}` : `Need ${needed} group, have ${available}`}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Only carryover (legacy) balances convert. This month's package sessions stay on the monthly package.
            {((user.cycle_private ?? 0) > 0 || (user.cycle_group ?? 0) > 0) && (
              <span className="block mt-0.5">This cycle: {user.cycle_private ?? 0}P / {user.cycle_group ?? 0}G (not convertible)</span>
            )}
          </p>
          <div className="p-3 rounded-xl bg-surface border border-theme">
            <p className="text-xs text-muted mb-2">After conversion:</p>
            <div className="flex items-center gap-3 text-sm font-bold">
              <span className="text-brand-text">Private: {resultPriv}</span>
              <ArrowRightLeft className="w-4 h-4 text-muted" />
              <span className="text-purple-400">Group: {resultGrp}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || insufficient} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
            {loading ? 'Converting...' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ALL_MODULES = ['dashboard', 'bookings', 'schedule', 'players', 'results', 'users', 'imports', 'comments', 'conversions']

export { ALL_MODULES }

export function UserModal({ user, onClose, onSave }) {
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState({
    name: user?.name || user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role || 'player',
    permissions: user?.permissions || [],
    password: '',
    private_balance: user?.private_balance ?? 0,
    group_balance: user?.group_balance ?? 0,
    skill_level: user?.skill_level || 'Intermediate',
    dob: user?.dob || '',
    position: user?.position || '',
    notes: user?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/roles').then(setRoles).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (user) {
        const updates = { name: form.name, email: form.email, phone: form.phone, role: form.role, permissions: form.permissions }
        if (user.role === 'player' || form.role === 'player') {
          // Balances never go through general edit — profile Balance Control only
          updates.skill_level = form.skill_level
          updates.dob = form.dob
          updates.position = form.position
          updates.notes = form.notes
        }
        await api.put(`/users/${user.id}`, updates)
      } else {
        if (form.role !== 'player' && !form.password) {
          setError('Password is required for non-player users')
          setLoading(false)
          return
        }
        const createBody = { ...form }
        if (form.role === 'player') {
          delete createBody.private_balance
          delete createBody.group_balance
        }
        await api.post('/users', createBody)
      }
      onSave()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = (mod) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(mod) ? f.permissions.filter(p => p !== mod) : [...f.permissions, mod]
    }))
  }

  const isPlayer = user?.role === 'player' || form.role === 'player'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">{user ? 'Edit User' : 'Create User'}</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Role *</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
                {(roles.length > 0 ? roles : [{ name: 'player', display_name: 'Player' }, { name: 'coach', display_name: 'Coach' }, { name: 'admin', display_name: 'Admin' }, { name: 'superadmin', display_name: 'Super Admin' }]).map(r => (
                  <option key={r.name} value={r.name}>{r.display_name}</option>
                ))}
              </select>
            </div>
          </div>
          {(form.role === 'admin' || form.role === 'coach') && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Module Access (per-user overrides)</label>
              <p className="text-[11px] text-muted mb-2">Modules granted by the <strong>{form.role}</strong> role are shown in green. Extra checks below are per-user overrides on top of the role baseline.</p>
              <div className="grid grid-cols-3 gap-2">
                {ALL_MODULES.map(mod => (
                  <button key={mod} type="button" onClick={() => togglePermission(mod)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                    form.permissions.includes(mod)
                      ? 'bg-brand/10 text-brand-text border-brand-text/40'
                      : 'bg-surface text-muted border-theme'
                  }`}>
                    {mod}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isPlayer && user && (
            <div className="p-3 rounded-xl bg-surface border border-theme">
              <p className="text-xs text-muted">
                Balances are managed on this player's <span className="font-bold text-brand-text">profile → Balance Control</span> (one player at a time).
              </p>
            </div>
          )}
          {isPlayer && !user && (
            <div className="p-3 rounded-xl bg-surface border border-theme">
              <p className="text-xs text-muted">New players start with 0 sessions. Add packages from the player profile after creation.</p>
            </div>
          )}
          {isPlayer && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Skill</label>
                  <select value={form.skill_level} onChange={e => setForm({ ...form, skill_level: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">DOB</label>
                  <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Position</label>
                  <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
                    <option value="">Not Set</option>
                    <option value="Right">Right</option>
                    <option value="Left">Left</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text resize-none" />
              </div>
            </>
          )}
          {!user && form.role !== 'player' && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Password *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
            </div>
          )}
          {!user && form.role === 'player' && (
            <p className="text-[11px] text-muted">Player accounts are created without a password; credentials can be exported later.</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" /> : user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function HistoryModal({ user, onClose }) {
  const [sessions, setSessions] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/users/${user.id}/report`).then(data => {
      setReport(data)
      setSessions(data.sessions || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user.id])

  const handleDownloadPDF = async () => {
    if (!report) return
    const { generateReceiptPDF } = await import('../../lib/receiptPDF')
    const doc = generateReceiptPDF(report)
    doc.save(`receipt_${(user.name || user.full_name || '').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand/20 text-brand-text flex items-center justify-center font-bold text-sm">{(user.name || '?').charAt(0)}</div>
            <div>
              <h3 className="text-lg font-bold text-theme">{user.name} — Session Report</h3>
              <p className="text-xs text-muted">{sessions.length} session{sessions.length !== 1 ? 's' : ''}{report && report.amount_owed > 0 && <span className="ml-2 text-amber-400 font-bold">EGP {report.amount_owed.toLocaleString()} owed</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report && report.amount_owed > 0 && (
              <button onClick={handleDownloadPDF} className="px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-400 text-xs font-bold hover:bg-amber-400/20 flex items-center gap-1">
                <Download className="w-3 h-3" /> Receipt PDF
              </button>
            )}
            <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">No sessions found for this player.</p>
        ) : (
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-muted uppercase">
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">Court</th>
                  <th className="text-left px-3 py-2 font-semibold">Type</th>
                  <th className="text-center px-3 py-2 font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {sessions.map((s, i) => (
                  <tr key={i} className="text-theme">
                    <td className="px-3 py-2.5">{s.date}</td>
                    <td className="px-3 py-2.5 font-mono">{s.time}</td>
                    <td className="px-3 py-2.5">Court {s.court}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${s.session_type === 'group' ? 'bg-purple-400/20 text-purple-400' : 'bg-blue-400/20 text-blue-400'}`}>{s.session_type || 'private'}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      {s.paid ? <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">Paid</span> : <span className="text-slate-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Close</button>
      </div>
    </div>
  )
}

export function TransferModal({ player, onClose, allPlayers }) {
  const [toPlayer, setToPlayer] = useState('')
  const [sessionType, setSessionType] = useState('private')
  const [count, setCount] = useState(1)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!toPlayer) { setError('Select a recipient'); return }
    if (count <= 0) { setError('Count must be > 0'); return }
    setLoading(true)
    try {
      const res = await api.post('/transfers', {
        from_player_id: player.id,
        to_player_id: parseInt(toPlayer),
        session_type: sessionType,
        count: parseInt(count),
        notes: notes || undefined,
      })
      setResult(res.transfer)
    } catch (err) {
      setError(err.message || 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md animate-fadeIn">
        <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-brand-text mx-auto mb-4" />
          <h3 className="text-lg font-bold text-theme mb-2">Transfer Complete</h3>
          <p className="text-muted text-sm mb-4">Transferred {result.count} {result.session_type} session(s) from {result.from.name} to {result.to.name}</p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-brand text-white font-bold text-sm">Done</button>
        </div>
      </div>
    )
  }

  const others = allPlayers.filter(p => p.id !== player.id)
  const availablePriv = player.private_balance ?? player.total_private ?? 0
  const availableGrp = (player.group_balance ?? player.total_group ?? 0) + (player.private_balance ?? player.total_private ?? 0) * 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-theme">Transfer Sessions — {player.name || player.full_name}</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted uppercase">Transfer To</label>
            <select value={toPlayer} onChange={e => setToPlayer(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm">
              <option value="">Select player...</option>
              {others.map(p => <option key={p.id} value={p.id}>{p.name || p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase">Session Type</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setSessionType('private')} className={`flex-1 py-2 rounded-xl text-sm font-bold border ${sessionType === 'private' ? 'bg-blue-400/20 border-blue-400 text-blue-400' : 'bg-surface border-theme text-muted'}`}>Private ({availablePriv} avail)</button>
              <button type="button" onClick={() => setSessionType('group')} className={`flex-1 py-2 rounded-xl text-sm font-bold border ${sessionType === 'group' ? 'bg-purple-400/20 border-purple-400 text-purple-400' : 'bg-surface border-theme text-muted'}`}>Group ({availableGrp} eff.)</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase">Count</label>
            <input type="number" min="1" value={count} onChange={e => setCount(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm" placeholder="Reason for transfer..." />
          </div>
          {error && <p className="text-rose-400 text-xs font-bold">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-900 font-bold text-sm disabled:opacity-50">
            {loading ? 'Transferring...' : 'Confirm Transfer'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ImportModal({ kind, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await api.upload(`/imports/${kind}/preview`, fd)
      setPreview(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    setCommitting(true)
    setError('')
    try {
      const data = await api.post(`/imports/${kind}/commit`, { rows: preview.preview, filename: preview.filename })
      setResult(data)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const blob = await downloadFile(`/imports/template/${kind}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kind}_import_template.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-brand-text mx-auto mb-4" />
          <h3 className="text-xl font-bold text-theme mb-2">Import Complete</h3>
          <p className="text-muted text-sm mb-4">{result.inserted} {kind} imported successfully.</p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">Import {kind.charAt(0).toUpperCase() + kind.slice(1)} from Excel</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button onClick={downloadTemplate} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" /> Download Template
          </button>
        </div>

        <div className="border-2 border-dashed border-theme rounded-xl p-8 text-center mb-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files[0])} className="hidden" />
          <FileUp className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm mb-3">{file ? file.name : 'Drop your Excel file here or click to browse'}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => fileRef.current.click()} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Choose File</button>
            {file && <button onClick={handleUpload} disabled={loading} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold disabled:opacity-50">{loading ? 'Processing...' : 'Upload & Preview'}</button>}
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}

        {preview && (
          <div>
            <div className="flex items-center gap-4 mb-3 text-sm">
              <span className="text-theme font-semibold">Total: {preview.totalRows}</span>
              <span className="text-brand-text font-semibold">Valid: {preview.validRows}</span>
              <span className="text-rose-400 font-semibold">Errors: {preview.errors.length}</span>
            </div>

            {preview.errors.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs max-h-32 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <div key={i}>Row {e.row}: {e.errors.join(', ')}</div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto max-h-64 overflow-y-auto mb-4">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-muted uppercase">
                    {preview.preview[0] && Object.keys(preview.preview[0]).map(k => (
                      <th key={k} className="text-left px-3 py-2 font-semibold">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="text-theme">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={handleCommit} disabled={committing || preview.validRows === 0} className="w-full py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm disabled:opacity-50">
              {committing ? 'Importing...' : `Import ${preview.validRows} Valid Rows`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const ROLE_STYLES = {
  superadmin: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  coach: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  player: 'bg-slate-500/10 text-muted border-slate-500/20',
}

export default function Users() {
  const { isAdmin, user: me } = useAuth()
  const navigate = useNavigate()
  const canEdit = isAdmin || me?.role === 'superadmin' || me?.role === 'admin'
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [showImport, setShowImport] = useState(false)

  const fetchUsers = () => {
    setLoading(true)
    api.get('/users').then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const playersOnly = users.filter(u => u.role === 'player')
  const filteredUsers = users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false
    if (skillFilter && u.skill_level !== skillFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone && u.phone.includes(q)) || (u.member_code && u.member_code.includes(q))
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Users</h1>
          <p className="text-muted text-sm mt-1">{filteredUsers.length} of {users.length} users · {playersOnly.length} players</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button onClick={() => setShowImport(true)} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
              <Upload className="w-4 h-4" /> Import Excel
            </button>
          )}
          <button onClick={async () => { try { const blob = await downloadFile('/users/export-credentials'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mm-padel-credentials.xlsx'; a.click(); URL.revokeObjectURL(url) } catch (err) { alert(err.message || 'Export failed') } }} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" /> Export Credentials
          </button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create User
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-theme rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
          <option value="">All Roles</option>
          <option value="player">Players</option>
          <option value="coach">Coaches</option>
          <option value="admin">Admins</option>
          <option value="superadmin">Super Admins</option>
        </select>
        <select value={skillFilter} onChange={e => setSkillFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
          <option value="">All Levels</option>
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-theme">
                  <th className="text-left px-6 py-4 font-semibold">Code</th>
                  <th className="text-left px-6 py-4 font-semibold">User</th>
                  <th className="text-left px-6 py-4 font-semibold">Email</th>
                  <th className="text-left px-6 py-4 font-semibold">Role</th>
                  <th className="text-left px-6 py-4 font-semibold">Skill</th>
                  <th className="text-left px-6 py-4 font-semibold">Status</th>
                  <th className="text-left px-6 py-4 font-semibold">Joined</th>
                  <th className="text-center px-6 py-4 font-semibold">Used</th>
                  <th className="text-center px-6 py-4 font-semibold">Rem. Private</th>
                  <th className="text-center px-6 py-4 font-semibold">Rem. Group</th>
                  <th className="text-center px-6 py-4 font-semibold">All Private</th>
                  <th className="text-center px-6 py-4 font-semibold">All Group</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-muted text-sm">
                      {search ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                ) : filteredUsers.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="hover:bg-white/50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-brand-text">{u.member_code || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand/20 text-brand-text flex items-center justify-center font-bold text-xs">{u.name?.charAt(0)}</div>
                        <div>
                          <span className="font-semibold text-theme">{u.name}</span>
                          {u.position && <span className="ml-2 text-[10px] text-muted">({u.position})</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-theme">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${ROLE_STYLES[u.role] || ROLE_STYLES.player}`}>
                        <Shield className="w-3 h-3" />
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.role === 'player' ? (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.skill_level === 'Advanced' ? 'bg-purple-500/10 text-purple-400' : u.skill_level === 'Beginner' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {u.skill_level || '—'}
                        </span>
                      ) : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${(u.account_status || 'active') === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                        {(u.account_status || 'active') === 'active' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {(u.account_status || 'active') === 'active' ? 'Active' : 'Locked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.used_sessions || 0) > 0 ? 'bg-brand/15 text-brand-text' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.used_sessions || 0) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.private_balance || 0) > 0 ? 'bg-brand/15 text-brand-text' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.private_balance ?? 0) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.group_balance || 0) > 0 ? 'bg-purple-400/15 text-purple-400' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.group_balance ?? 0) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.total_private || 0) > 0 ? 'bg-brand/15 text-brand-text' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.total_private ?? 0) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.total_group || 0) > 0 ? 'bg-purple-400/15 text-purple-400' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.total_group ?? 0) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && <UserModal user={null} onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); fetchUsers() }} />}
      {showImport && <ImportModal kind="players" onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); fetchUsers() }} />}
    </div>
  )
}

