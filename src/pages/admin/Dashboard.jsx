import { useState, useEffect } from 'react'
import { ArrowRightLeft, BarChart3, Calendar, CheckCircle2, Clock, FileUp, Send, TrendingUp, Users, UserX, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

function StatCard({ icon: Icon, label, value, color = 'lime' }) {
  const colors = {
    lime: 'bg-lime-400/10 text-lime-400 border-lime-400/20',
    blue: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    purple: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    rose: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
    cyan: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
  }
  return (
    <div className="glass-panel rounded-2xl p-5 border border-theme">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl border ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-black text-theme font-heading">{value}</p>
    </div>
  )
}

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingRequests, setPendingRequests] = useState([])
  const [decidingId, setDecidingId] = useState(null)
  const [proposeForm, setProposeForm] = useState(null)
  const [proposeData, setProposeData] = useState({ proposed_date: '', proposed_time: '' })

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
    if (isAdmin) {
      api.get('/booking-requests?status=pending')
        .then(data => setPendingRequests(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
  }, [isAdmin])

  const handleDecide = async (id, decision, extra = {}) => {
    setDecidingId(id)
    try {
      await api.put(`/booking-requests/${id}/decide`, { decision, ...extra })
      setPendingRequests(prev => prev.filter(r => r.id !== id))
      setProposeForm(null)
    } catch {}
    setDecidingId(null)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>
  if (!data) return null

  const { stats, recentBookings, recentImports, usersByRole, sessionCredits = [], upcomingSlots = [], slotsByDate = {} } = data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-black text-theme">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Academy overview and key metrics</p>
      </div>

      {/* Pending Requests Strip */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="glass-panel rounded-2xl border border-amber-400/30 p-6 bg-amber-400/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-theme flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Pending Requests
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold">{pendingRequests.length}</span>
            </h3>
          </div>
          <div className="space-y-3">
            {pendingRequests.map(r => (
              <div key={r.id} className="p-4 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      r.kind === 'new_booking' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      r.kind === 'cancel' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {r.kind === 'new_booking' ? 'New Booking' : r.kind === 'cancel' ? 'Cancel' : 'Modify'}
                    </span>
                    <span className="text-sm font-semibold text-theme">{r.player_name || 'Player'}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {r.slot_id ? `Slot #${r.slot_id}` : ''}
                    {r.payload?.session_type ? ` — ${r.payload.session_type}` : ''}
                    {r.payload?.date ? ` — ${r.payload.date}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.kind === 'modify' && proposeForm === r.id ? (
                    <div className="flex items-center gap-2">
                      <input type="date" value={proposeData.proposed_date} onChange={e => setProposeData({ ...proposeData, proposed_date: e.target.value })} className="px-2 py-1 rounded-lg bg-surface border border-theme text-theme text-[11px]" />
                      <select value={proposeData.proposed_time} onChange={e => setProposeData({ ...proposeData, proposed_time: e.target.value })} className="px-2 py-1 rounded-lg bg-surface border border-theme text-theme text-[11px]">
                        <option value="">Time</option>
                        {['14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => handleDecide(r.id, 'approved', proposeData)} disabled={!proposeData.proposed_date || !proposeData.proposed_time || decidingId === r.id} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg disabled:opacity-30">
                        <Send className="w-4 h-4" />
                      </button>
                      <button onClick={() => setProposeForm(null)} className="p-1.5 text-slate-400 hover:bg-slate-500/10 rounded-lg">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => handleDecide(r.id, 'approved')} disabled={decidingId === r.id} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-30" title="Approve">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      {r.kind === 'modify' && (
                        <button onClick={() => { setProposeForm(r.id); setProposeData({ proposed_date: '', proposed_time: '' }) }} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors" title="Propose New Time">
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDecide(r.id, 'denied')} disabled={decidingId === r.id} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30" title="Deny">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Users" value={stats.totalUsers} color="blue" />
        <StatCard icon={UserX} label="Players" value={stats.totalPlayers} color="purple" />
        <StatCard icon={BarChart3} label="Results" value={stats.totalResults} color="amber" />
        <StatCard icon={Calendar} label="Bookings" value={stats.totalBookings} color="lime" />
        <StatCard icon={TrendingUp} label="Revenue" value={`EGP ${stats.totalRevenue.toLocaleString()}`} color="cyan" />
        <StatCard icon={FileUp} label="Occupancy" value={`${stats.occupiedSlots || 0}/${stats.totalSlots || 0} (${stats.occupancyRate}%)`} color="rose" />
      </div>

      {/* Schedule Overview */}
      {upcomingSlots.length > 0 && (
        <div className="glass-panel rounded-2xl border border-theme p-6">
          <h3 className="text-lg font-bold text-theme mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-cyan-400" /> Upcoming Schedule</h3>
          <div className="space-y-3">
            {Object.entries(slotsByDate).filter(([d]) => d >= new Date().toISOString().slice(0, 10)).slice(0, 7).map(([date, info]) => {
              const daySlots = upcomingSlots.filter(s => s.date === date)
              const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T00:00:00').getDay()]
              return (
                <div key={date} className="p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-theme">{dayName} {date}</span>
                    <span className="text-[10px] text-muted">{info.occupied}/{info.total} slots filled</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map(s => (
                      <span key={s.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        s.session_type === 'private'
                          ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                          : 'bg-purple-400/10 text-purple-400 border-purple-400/20'
                      }`}>
                        <span>{s.time}</span>
                        <span>C{s.court}</span>
                        {s.player_text && <span className="opacity-70">· {s.player_text.length > 15 ? s.player_text.slice(0, 15) + '…' : s.player_text}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl border border-theme p-6">
          <h3 className="text-lg font-bold text-theme mb-4">Users by Role</h3>
          <div className="space-y-3">
            {usersByRole.map(r => (
              <div key={r.role} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-theme capitalize">{r.role}</span>
                    <span className="text-theme font-bold">{r.count}</span>
                  </div>
                  <div className="h-2 bg-theme rounded-full overflow-hidden">
                    <div className="h-full bg-lime-400 rounded-full transition-all" style={{ width: `${stats.totalUsers > 0 ? (r.count / stats.totalUsers) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-theme p-6">
          <h3 className="text-lg font-bold text-theme mb-4">Recent Bookings</h3>
          {recentBookings.length === 0 ? (
            <p className="text-muted text-sm">No bookings yet.</p>
          ) : (
            <div className="space-y-3">
              {recentBookings.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme">
                  <div>
                    <p className="text-sm font-semibold text-theme">{b.user_name || 'Unknown'}</p>
                    <p className="text-xs text-muted">{b.ref} - {b.session_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-lime-400">EGP {b.total?.toLocaleString()}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : b.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-muted'}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="text-lg font-bold text-theme mb-4 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-purple-400" /> Session Credits (Private &harr; Group)</h3>
        {sessionCredits.length === 0 ? (
          <p className="text-muted text-sm">No active credits.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase">
                  <th className="text-left pb-3 font-semibold">Player</th>
                  <th className="text-left pb-3 font-semibold">Private Balance</th>
                  <th className="text-left pb-3 font-semibold">Group Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme/60">
                {sessionCredits.map(c => (
                  <tr key={c.user_id}>
                    <td className="py-3 text-theme font-medium">{c.name}</td>
                    <td className="py-3 text-lime-400 font-bold">{c.private_balance}</td>
                    <td className="py-3 text-lime-400 font-bold">{c.group_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="text-lg font-bold text-theme mb-4">Recent Imports</h3>
        {recentImports.length === 0 ? (
          <p className="text-muted text-sm">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase">
                  <th className="text-left pb-3 font-semibold">Kind</th>
                  <th className="text-left pb-3 font-semibold">Filename</th>
                  <th className="text-left pb-3 font-semibold">Rows</th>
                  <th className="text-left pb-3 font-semibold">By</th>
                  <th className="text-left pb-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme/60">
                {recentImports.map(ib => (
                  <tr key={ib.id}>
                    <td className="py-3 text-theme font-medium capitalize">{ib.kind}</td>
                    <td className="py-3 text-theme">{ib.filename}</td>
                    <td className="py-3 text-theme">{ib.row_count}</td>
                    <td className="py-3 text-theme">{ib.user_name || 'Unknown'}</td>
                    <td className="py-3 text-muted text-xs">{new Date(ib.created_at).toLocaleDateString()}</td>
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
