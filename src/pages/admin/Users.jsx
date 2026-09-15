import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Download, Edit, Key, Plus, Search, Shield, Trash2, X, ArrowRightLeft } from 'lucide-react'
import { api, downloadFile } from '../../lib/api'

function ConvertModal({ user, onClose, onDone }) {
  const [from, setFrom] = useState('private')
  const [count, setCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const priv = user.private_balance || 0
  const grp = user.group_balance || 0
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
              <button onClick={() => setFrom('private')} className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${fromPriv ? 'bg-lime-400/15 text-lime-400 border-lime-400/40' : 'bg-surface text-muted border-theme'}`}>
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
            <input type="number" min="1" value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          {insufficient && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
              Insufficient balance. {fromPriv ? `Need ${needed} private, have ${available}` : `Need ${needed} group, have ${available}`}
            </div>
          )}
          <div className="p-3 rounded-xl bg-surface border border-theme">
            <p className="text-xs text-muted mb-2">After conversion:</p>
            <div className="flex items-center gap-3 text-sm font-bold">
              <span className="text-lime-400">Private: {resultPriv}</span>
              <ArrowRightLeft className="w-4 h-4 text-muted" />
              <span className="text-purple-400">Group: {resultGrp}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || insufficient} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
            {loading ? 'Converting...' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ALL_MODULES = ['dashboard', 'bookings', 'schedule', 'players', 'results', 'users', 'imports', 'comments', 'conversions']

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role || 'player',
    permissions: user?.permissions || [],
    password: '',
    private_balance: user?.private_balance ?? 0,
    group_balance: user?.group_balance ?? 0,
    skill_level: user?.skill_level || 'Intermediate',
    notes: user?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (user) {
        const updates = { name: form.name, email: form.email, phone: form.phone, role: form.role, permissions: form.permissions }
        if (user.role === 'player') {
          updates.private_balance = Number(form.private_balance)
          updates.group_balance = Number(form.group_balance)
          updates.skill_level = form.skill_level
          updates.notes = form.notes
        }
        await api.put(`/users/${user.id}`, updates)
      } else {
        if (!form.password) { setError('Password is required for new users'); setLoading(false); return }
        await api.post('/users', form)
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
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Role *</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                <option value="player">Player</option>
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
          </div>
          {(form.role === 'admin' || form.role === 'coach') && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">Module Access</label>
              <div className="grid grid-cols-3 gap-2">
                {ALL_MODULES.map(mod => (
                  <button key={mod} type="button" onClick={() => togglePermission(mod)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                    form.permissions.includes(mod)
                      ? 'bg-lime-400/10 text-lime-400 border-lime-400/40'
                      : 'bg-surface text-muted border-theme'
                  }`}>
                    {mod}
                  </button>
                ))}
              </div>
            </div>
          )}
          {user?.role === 'player' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Private Balance</label>
                  <input type="number" min="0" value={form.private_balance} onChange={e => setForm({ ...form, private_balance: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Group Balance</label>
                  <input type="number" min="0" value={form.group_balance} onChange={e => setForm({ ...form, group_balance: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Skill Level</label>
                <select value={form.skill_level} onChange={e => setForm({ ...form, skill_level: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400 resize-none" />
              </div>
            </>
          )}
          {!user && (
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Password *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" /> : user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
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
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [resetConfirm, setResetConfirm] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [convertUser, setConvertUser] = useState(null)
  const [search, setSearch] = useState('')

  const fetchUsers = () => {
    setLoading(true)
    api.get('/users').then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone && u.phone.includes(q)) || (u.member_code && u.member_code.includes(q))
  })

  const handleDelete = async (id) => {
    try { await api.del(`/users/${id}`); setDeleteConfirm(null); fetchUsers() } catch {}
  }

  const handleResetPassword = async (id) => {
    try {
      const data = await api.post(`/users/${id}/reset-password`)
      setResetConfirm(null)
      setResetResult(data)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Users</h1>
          <p className="text-muted text-sm mt-1">{filteredUsers.length} of {users.length} users</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => { try { const blob = await downloadFile('/users/export-credentials'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mm-padel-credentials.xlsx'; a.click(); URL.revokeObjectURL(url) } catch (err) { alert(err.message || 'Export failed') } }} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" /> Export Credentials
          </button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create User
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-theme rounded-lg">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
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
                  <th className="text-left px-6 py-4 font-semibold">Joined</th>
                  <th className="text-center px-6 py-4 font-semibold">Used</th>
                  <th className="text-center px-6 py-4 font-semibold">Rem. Private</th>
                  <th className="text-center px-6 py-4 font-semibold">Rem. Group</th>
                  <th className="text-right px-6 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted text-sm">
                      {search ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-white/50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-lime-400">{u.member_code || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs">{u.name?.charAt(0)}</div>
                        <span className="font-semibold text-theme">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-theme">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${ROLE_STYLES[u.role] || ROLE_STYLES.player}`}>
                        <Shield className="w-3 h-3" />
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.used_sessions || 0) > 0 ? 'bg-lime-400/15 text-lime-400' : 'bg-surface/80 text-muted'
                      }`}>
                        {u.role === 'player' ? (u.used_sessions || 0) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                        (u.private_balance || 0) > 0 ? 'bg-lime-400/15 text-lime-400' : 'bg-surface/80 text-muted'
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
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {u.role === 'player' && <button onClick={() => setConvertUser(u)} className="p-2 text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg" title="Convert Balances"><ArrowRightLeft className="w-4 h-4" /></button>}
                        <button onClick={() => setEditUser(u)} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg" title="Edit"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => setResetConfirm(u)} className="p-2 text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg" title="Reset Password"><Key className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(u)} className="p-2 text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(showAdd || editUser) && <UserModal user={editUser} onClose={() => { setShowAdd(false); setEditUser(null) }} onSave={() => { setShowAdd(false); setEditUser(null); fetchUsers() }} />}

      {convertUser && <ConvertModal user={convertUser} onClose={() => setConvertUser(null)} onDone={() => { setConvertUser(null); fetchUsers() }} />}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-theme mb-2">Delete User?</h3>
            <p className="text-muted text-sm mb-6">Are you sure you want to delete {deleteConfirm.name}? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <Key className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-theme mb-2">Reset Password?</h3>
            <p className="text-muted text-sm mb-6">A temporary password will be generated for {resetConfirm.name}.</p>
            <div className="flex gap-3">
              <button onClick={() => setResetConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={() => handleResetPassword(resetConfirm.id)} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold">Reset</button>
            </div>
          </div>
        </div>
      )}

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-lime-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-theme mb-2">Password Reset</h3>
            <p className="text-muted text-sm mb-2">Temporary password:</p>
            <code className="block p-3 rounded-xl bg-surface border border-theme text-lime-400 font-mono text-lg font-bold mb-4">{resetResult.tempPassword}</code>
            <p className="text-muted text-xs mb-4">Share this password securely. The user will be forced to change it on next login.</p>
            <button onClick={() => setResetResult(null)} className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
