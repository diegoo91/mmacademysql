export default function GroupStandings({ standings, highlight = 0 }) {
  if (!standings || !Object.keys(standings).length) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Object.entries(standings).map(([label, rows]) => (
        <div key={label} className="glass-panel rounded-2xl border border-theme overflow-hidden">
          <div className="px-4 py-3 border-b border-theme flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-extrabold flex items-center justify-center">
              {label}
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Standings</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-[10px] uppercase border-b border-theme">
                  <th className="text-left px-3 py-2 font-semibold">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Team</th>
                  <th className="text-center px-2 py-2 font-semibold">P</th>
                  <th className="text-center px-2 py-2 font-semibold">W</th>
                  <th className="text-center px-2 py-2 font-semibold">L</th>
                  <th className="text-center px-2 py-2 font-semibold">Games</th>
                  <th className="text-center px-2 py-2 font-semibold">+/-</th>
                  <th className="text-center px-3 py-2 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme/60">
                {rows.map((r) => {
                  const qualifies = highlight > 0 && r.position <= highlight
                  return (
                    <tr key={r.team_id}
                      className={`${qualifies ? 'bg-brand/5' : ''} hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors`}>
                      <td className={`px-3 py-2 text-xs font-extrabold ${qualifies ? 'text-brand-text' : 'text-muted'}`}>
                        {r.position}
                      </td>
                      <td className="px-3 py-2 text-xs text-theme font-semibold">
                        <span className="truncate inline-block max-w-[160px] align-middle">{r.team_name}</span>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted">{r.played}</td>
                      <td className="px-2 py-2 text-center text-xs text-theme font-bold">{r.won}</td>
                      <td className="px-2 py-2 text-center text-xs text-muted">{r.lost}</td>
                      <td className="px-2 py-2 text-center text-xs text-muted tabular-nums">{r.games_won}–{r.games_lost}</td>
                      <td className={`px-2 py-2 text-center text-xs tabular-nums font-bold ${r.games_diff > 0 ? 'text-emerald-500' : r.games_diff < 0 ? 'text-rose-400' : 'text-muted'}`}>
                        {r.games_diff > 0 ? `+${r.games_diff}` : r.games_diff}
                      </td>
                      <td className="px-3 py-2 text-center text-xs font-extrabold text-theme tabular-nums">{r.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
