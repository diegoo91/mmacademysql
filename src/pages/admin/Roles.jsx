import { useState, useEffect } from 'react'
import { Shield, Save, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

const ALL_MODULES = ['dashboard', 'bookings', 'schedule', 'players', 'results', 'users', 'imports', 'comments', 'conversions']

export default function Roles() {
  const [roles, setRoles] = useState([])
  const [editing, setEditing] = useState(null)
  const [formPerms, setFormPerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get('/roles')
      .then(data => setRoles(data))
      .catch(e => setMsg(e.message))
      .finally(() => setLoading(false))
  }, [])

  const startEdit = (role) => {
    setEditing(role.name)
    setFormPerms(role.permissions || [])
    setMsg('')
  }

  const togglePerm = (mod) => {
    setFormPerms(prev => prev.includes(mod) ? prev.filter(p => p !== mod) : [...prev, mod])
  }

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const updated = await api.put(`/roles/${editing}`, { permissions: formPerms })
      setRoles(prev => prev.map(r => r.name === editing ? updated : r))
      setEditing(null)
      setMsg('Role updated successfully')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-text border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-theme flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-text" /> Role Permissions
        </h2>
        {msg && <span className={`text-sm font-bold ${msg.includes('error') || msg.includes('Error') ? 'text-rose-400' : 'text-brand-text'}`}>{msg}</span>}
      </div>

      <p className="text-sm text-muted">
        Edit module permissions for each role. The superadmin role is locked to all modules.
        Per-user overrides (set in Users) add extra modules on top of the role baseline.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map(role => (
          <div key={role.name} className={`p-5 rounded-2xl border transition-all ${
            editing === role.name ? 'bg-brand/5 border-brand-text/30' : 'bg-surface border-theme'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-extrabold text-theme text-lg">{role.display_name}</h3>
                <span className="text-xs text-muted">Level {role.level} · {(role.permissions || []).length} module{(role.permissions || []).length !== 1 ? 's' : ''}</span>
              </div>
              {role.name !== 'superadmin' ? (
                editing === role.name ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-bold">Cancel</button>
                    <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(role)} className="px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-xs font-bold hover:border-brand-text/50">Edit</button>
                )
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-brand/10 text-brand-text text-xs font-bold border border-brand-text/30">All modules (locked)</span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALL_MODULES.map(mod => {
                const has = (editing === role.name ? formPerms : role.permissions || []).includes(mod)
                return (
                  <button
                    key={mod}
                    onClick={() => editing === role.name && togglePerm(mod)}
                    disabled={editing !== role.name}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      has
                        ? 'bg-brand/10 text-brand-text border-brand-text/40'
                        : 'bg-surface text-muted border-theme'
                    } ${editing === role.name ? 'cursor-pointer hover:border-brand-text/50' : ''}`}
                  >
                    {mod}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
