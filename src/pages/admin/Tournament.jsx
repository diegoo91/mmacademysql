import { Trophy } from 'lucide-react'

export default function AdminTournament() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Tournament</h1>
          <p className="text-muted text-sm mt-1">Admin tools for tournaments — coming later.</p>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-gold/15 border border-gold/40 text-gold text-[11px] font-extrabold uppercase tracking-wider">
          Placeholder
        </span>
      </div>

      <div className="glass-card rounded-2xl p-10 text-center space-y-4 bg-surface/60 dark:bg-slate-900/60">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand/10 border border-brand-text/30 text-brand-text flex items-center justify-center">
          <Trophy className="w-7 h-7" />
        </div>
        <h2 className="font-heading text-xl font-extrabold text-theme">Nothing to manage yet</h2>
        <p className="text-muted text-sm max-w-md mx-auto">
          This shell is ready for brackets, registrations and scheduling. Full functionality will be added when instructions are ready.
        </p>
      </div>
    </div>
  )
}
