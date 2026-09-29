import { useEffect, useState } from 'react'
import { parseDbTs } from '../lib/tournament'

function pad(n) {
  return String(n).padStart(2, '0')
}

export default function TournamentCountdown({ target, label = 'Closes in', doneLabel = 'Registration closed', className = '' }) {
  const [now, setNow] = useState(() => Date.now())
  const dt = parseDbTs(target)

  useEffect(() => {
    if (!target) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  if (!dt) return null
  const diff = dt.getTime() - now

  if (diff <= 0) {
    return (
      <span className={`inline-flex items-center gap-2 text-xs font-bold text-muted ${className}`}>
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        {doneLabel}
      </span>
    )
  }

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  const text = days > 0 ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(hours)}:${pad(mins)}:${pad(secs)}`

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-bold text-theme ${className}`}>
      <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
      {label}
      <span className="tabular-nums text-gold">{text}</span>
    </span>
  )
}
