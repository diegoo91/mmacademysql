import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, DollarSign, Download, AlertTriangle, TrendingUp, Trophy, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function DateRangeSelector({ preset, setPreset, from, setFrom, to, setTo }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-theme">
        {[
          { id: 'week', label: 'This Week' },
          { id: 'month', label: 'This Month' },
          { id: 'custom', label: 'Custom' },
        ].map(opt => (
          <button key={opt.id} onClick={() => setPreset(opt.id)} className={`px-4 py-2 rounded-xl font-extrabold text-xs transition-all ${
            preset === opt.id ? 'bg-lime-400 text-slate-950 shadow-md' : 'text-muted hover:text-theme'
          }`}>
            {opt.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <div className="flex gap-2 items-center">
            <label className="text-xs font-bold text-muted">From:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs font-bold text-muted">To:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
          </div>
        </>
      )}
    </div>
  )
}

export default function Reports() {
  const { isAdmin } = useAuth()
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coachHours, setCoachHours] = useState(null)
  const [coachBalance, setCoachBalance] = useState(null)
  const [unpaidPlayers, setUnpaidPlayers] = useState(null)

  const fetchReport = () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('preset', preset)
    if (preset === 'custom') {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    api.get(`/reports/summary?${params}`).then(setData).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchReport(); if (isAdmin) { fetchCoachHours(); fetchCoachBalance(); fetchUnpaidPlayers() } }, [preset, from, to])

  const fetchCoachHours = () => {
    const params = new URLSearchParams()
    params.set('preset', preset)
    if (preset === 'custom') {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    api.get(`/reports/coach-hours?${params}`).then(setCoachHours).catch(() => {})
  }

  const fetchCoachBalance = () => {
    api.get('/reports/coach-balance').then(setCoachBalance).catch(() => {})
  }

  const fetchUnpaidPlayers = () => {
    api.get('/reports/unpaid').then(setUnpaidPlayers).catch(() => {})
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-black text-theme">Reports</h1>
        <p className="text-muted text-sm mt-1">Financial and operational overview</p>
      </div>

      <DateRangeSelector preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : !data ? (
        <div className="text-center py-12 text-muted">Failed to load report data.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-emerald-400/10"><DollarSign className="w-5 h-5 text-emerald-400" /></div>
                <span className="text-xs font-bold text-muted uppercase">Revenue</span>
              </div>
              <p className="font-heading text-2xl font-black text-theme">EGP {data.profit.revenue.toLocaleString()}</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-rose-400/10"><DollarSign className="w-5 h-5 text-rose-400" /></div>
                <span className="text-xs font-bold text-muted uppercase">Expenses</span>
              </div>
              <p className="font-heading text-2xl font-black text-theme">EGP {data.profit.expenses.toLocaleString()}</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-theme">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-lime-400/10"><TrendingUp className="w-5 h-5 text-lime-400" /></div>
                <span className="text-xs font-bold text-muted uppercase">Net Profit</span>
              </div>
              <p className={`font-heading text-2xl font-black ${data.profit.net >= 0 ? 'text-theme' : 'text-rose-400'}`}>EGP {data.profit.net.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => {
              const range = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
              downloadCSV(`profit_${range}.csv`, ['Metric', 'Amount (EGP)'], [
                ['Revenue', data.profit.revenue],
                ['Expenses', data.profit.expenses],
                ['Net Profit', data.profit.net],
              ])
            }} className="px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-[10px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1">
              <Download className="w-3 h-3" /> Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel rounded-2xl p-6 border border-theme">
              <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-lime-400" /> Past Payments
                <button onClick={() => {
                  const range = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
                  downloadCSV(`payments_${range}.csv`, ['Date', 'Player', 'Type', 'Amount (EGP)'],
                    data.payments.map(p => [p.date, p.player, p.session_type, p.amount])
                  )
                }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                  <Download className="w-3 h-3" /> CSV
                </button>
              </h3>
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No payments in this period.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface dark:bg-slate-900">
                      <tr className="text-muted uppercase">
                        <th className="text-left px-3 py-2 font-semibold">Date</th>
                        <th className="text-left px-3 py-2 font-semibold">Player</th>
                        <th className="text-left px-3 py-2 font-semibold">Type</th>
                        <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme">
                      {data.payments.map((p, i) => (
                        <tr key={i} className="text-theme">
                          <td className="px-3 py-2">{p.date}</td>
                          <td className="px-3 py-2 font-semibold">{p.player}</td>
                          <td className="px-3 py-2"><span className="text-[10px] font-bold uppercase">{p.session_type}</span></td>
                          <td className="px-3 py-2 text-right font-bold">EGP {p.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-2xl p-6 border border-theme">
              <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-lime-400" /> Sessions per Player
                <button onClick={() => {
                  const range = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
                  downloadCSV(`sessions_per_player_${range}.csv`, ['Player', 'Sessions'],
                    data.sessionsPerPlayer.map(p => [p.name, p.sessions])
                  )
                }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                  <Download className="w-3 h-3" /> CSV
                </button>
              </h3>
              {data.sessionsPerPlayer.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No sessions in this period.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {data.sessionsPerPlayer.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs">{p.name.charAt(0)}</div>
                        <span className="font-semibold text-theme text-sm">{p.name}</span>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-lime-400/10 text-lime-400 text-xs font-bold">{p.sessions} sessions</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 border border-theme">
            <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Unpaid Players
              <button onClick={() => {
                const rows = (unpaidPlayers?.unpaid_players || []).map(p => [
                  p.name, p.unpaid_sessions, p.unpaid_private, p.unpaid_group, `EGP ${p.amount_owed.toLocaleString()}`
                ])
                downloadCSV(`unpaid_players.csv`, ['Player', 'Unpaid Sessions', 'Private', 'Group', 'Amount Owed'], rows)
              }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                <Download className="w-3 h-3" /> CSV
              </button>
            </h3>
            {(!unpaidPlayers || !unpaidPlayers.unpaid_players || unpaidPlayers.unpaid_players.length === 0) ? (
              <p className="text-sm text-muted text-center py-4">No players with unpaid sessions.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {unpaidPlayers.unpaid_players.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold text-xs">{p.name.charAt(0)}</div>
                      <div>
                        <span className="font-semibold text-theme text-sm">{p.name}</span>
                        <div className="text-[10px] text-muted">{p.unpaid_sessions} unpaid ({p.unpaid_private}P + {p.unpaid_group}G)</div>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-400/10 text-amber-400 text-xs font-bold">EGP {p.amount_owed.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2 border-t border-theme">
                  <span className="text-xs font-bold text-muted">Total Owed</span>
                  <span className="text-sm font-black text-amber-400">EGP {unpaidPlayers.total_owed.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-6 border border-theme">
            <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-lime-400" /> Match Results
              <button onClick={() => {
                const range = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
                downloadCSV(`match_results_${range}.csv`, ['Player', 'Played', 'Wins', 'Losses', 'Top Partner', 'Top Opponent'],
                  (data.matchResults || []).map(p => [p.name, p.played, p.wins, p.losses, p.partners[0]?.name || '-', p.opponents[0]?.name || '-'])
                )
              }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                <Download className="w-3 h-3" /> CSV
              </button>
            </h3>
            {(!data.matchResults || data.matchResults.length === 0) ? (
              <p className="text-sm text-muted text-center py-4">No match results in this period.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {data.matchResults.map((p, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs">{p.name.charAt(0)}</div>
                        <span className="font-semibold text-theme text-sm">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="text-lime-400">{p.wins}W</span>
                        <span className="text-rose-400">{p.losses}L</span>
                        <span className="text-muted">{p.played} played</span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[11px] text-muted">
                      {p.partners.length > 0 && (
                        <span>Top partner: <span className="font-semibold text-theme">{p.partners[0].name}</span> ({p.partners[0].count}x)</span>
                      )}
                      {p.opponents.length > 0 && (
                        <span>Top opponent: <span className="font-semibold text-theme">{p.opponents[0].name}</span> ({p.opponents[0].count}x)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && coachHours && (
            <div className="glass-panel rounded-2xl p-6 border border-theme">
              <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-lime-400" /> Coach Hours
                <button onClick={() => {
                  const rows = []
                  for (const c of (coachHours.coachHours || [])) {
                    for (const d of (c.days || [])) {
                      rows.push([c.name, d.date, d.hours, d.notes || ''])
                    }
                  }
                  const range = preset === 'custom' ? `${from || 'start'}_to_${to || 'end'}` : preset
                  downloadCSV(`coach_hours_${range}.csv`, ['Coach', 'Date', 'Hours', 'Notes'], rows)
                }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                  <Download className="w-3 h-3" /> CSV
                </button>
              </h3>
              {(!coachHours.coachHours || coachHours.coachHours.length === 0) ? (
                <p className="text-sm text-muted text-center py-4">No coach hours in this period.</p>
              ) : (
                <div className="space-y-4">
                  {coachHours.coachHours.map((c, i) => (
                    <div key={i} className="rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs">{c.name.charAt(0)}</div>
                          <span className="font-semibold text-theme text-sm">{c.name}</span>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-lime-400/10 text-lime-400 text-xs font-bold">{c.hours} total hours</span>
                      </div>
                      {c.days && c.days.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {c.days.map((d, j) => (
                            <div key={j} className="px-3 py-2 rounded-lg bg-surface border border-theme text-xs">
                              <div className="font-mono text-muted">{d.date}</div>
                              <div className="font-bold text-theme mt-0.5">{d.hours}h {d.notes && <span className="text-muted font-normal">· {d.notes}</span>}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && coachBalance && (
            <div className="glass-panel rounded-2xl p-6 border border-theme">
              <h3 className="font-heading font-extrabold text-theme text-lg mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-lime-400" /> Coach Balances (Payroll)
                <button onClick={() => {
                  const rows = (coachBalance.balances || []).map(c => [c.name, c.total_earned, c.total_paid, c.balance])
                  downloadCSV(`coach_balances.csv`, ['Coach', 'Total Earned (h)', 'Total Paid (h)', 'Balance (h)'], rows)
                }} className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold text-muted hover:text-lime-400 hover:bg-lime-400/10 flex items-center gap-1">
                  <Download className="w-3 h-3" /> CSV
                </button>
              </h3>
              {(!coachBalance.balances || coachBalance.balances.length === 0) ? (
                <p className="text-sm text-muted text-center py-4">No coaches found.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {coachBalance.balances.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-theme/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs">{c.name.charAt(0)}</div>
                        <div>
                          <span className="font-semibold text-theme text-sm">{c.name}</span>
                          <div className="text-[10px] text-muted">Earned: {c.total_earned}h · Paid: {c.total_paid}h</div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.balance > 0 ? 'bg-amber-400/10 text-amber-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
                        {c.balance}h owed
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
