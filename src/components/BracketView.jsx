import { Trophy } from 'lucide-react'
import { MATCH_STATUS, roundLabel } from '../lib/tournament'

function TeamLine({ teamId, teamsById, score, isWinner, isDone, fallback }) {
  const team = teamId ? teamsById.get(teamId) : null
  const name = team ? team.team_name : fallback
  return (
    <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
      isDone && isWinner ? 'bg-brand/10 text-brand-text font-extrabold'
        : isDone ? 'text-muted' : 'text-theme font-semibold'}`}>
      <span className="truncate">{name}</span>
      {isDone && <span className={`tabular-nums ${isWinner ? 'text-brand-text' : ''}`}>{score}</span>}
    </div>
  )
}

export default function BracketView({ rows = [], teams = [] }) {
  if (!rows.length) return null
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const rounds = [...new Set(rows.map((r) => r.round_no))].sort((a, b) => a - b)
  const totalRounds = rounds.length

  const finalRow = rows.find((r) => r.round_no === rounds[rounds.length - 1] && r.status === 'completed')
  const champion = finalRow ? teamsById.get(finalRow.winner_team_id ?? finalRow.winner) : null

  return (
    <div className="space-y-4">
      {champion && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gold/10 border border-gold/40">
          <Trophy className="w-5 h-5 text-gold shrink-0" />
          <div className="text-sm">
            <span className="text-muted">Champions: </span>
            <span className="text-gold font-extrabold">{champion.team_name}</span>
          </div>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((rn) => {
          const roundRows = rows.filter((r) => r.round_no === rn).sort((a, b) => a.slot_index - b.slot_index)
          return (
            <div key={rn} className="min-w-[230px] flex-1 space-y-3">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted text-center">
                {roundLabel(rn, totalRounds)}
              </div>
              {roundRows.map((m) => {
                const st = MATCH_STATUS[m.status] || MATCH_STATUS.tbd
                const done = m.status === 'completed'
                const aFallback = m.a ? `Team ${m.a}` : m.status === 'bye' ? '—' : 'TBD'
                const bFallback = m.b ? `Team ${m.b}` : m.status === 'bye' ? '—' : 'TBD'
                return (
                  <div key={m.id} className="glass-panel rounded-xl border border-theme p-2 space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[10px] text-muted">#{m.slot_index + 1}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <TeamLine teamId={m.a} teamsById={teamsById} score={m.score_a} isWinner={done && m.winner === m.a}
                      isDone={done} fallback={aFallback} />
                    <div className="h-px bg-theme opacity-50 mx-1" />
                    <TeamLine teamId={m.b} teamsById={teamsById} score={m.score_b} isWinner={done && m.winner === m.b}
                      isDone={done} fallback={bFallback} />
                    {m.playable && (
                      <div className="text-center text-[9px] font-bold text-emerald-500 dark:text-emerald-400 uppercase">Ready to play</div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
