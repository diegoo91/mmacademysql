import { Trophy } from 'lucide-react'

export default function Tournament() {
  return (
    <div className="min-h-screen bg-theme text-theme py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand-text/30 text-brand-text text-xs font-extrabold uppercase tracking-widest">
          <Trophy className="w-4 h-4" />
          <span>Tournament</span>
        </div>
        <h1 className="font-heading text-4xl sm:text-5xl font-black text-theme">
          Coming Soon
        </h1>
        <p className="text-muted text-lg max-w-xl mx-auto leading-relaxed">
          Brackets, schedules and live draws are on the way. Check back soon for MM Padel Academy tournaments.
        </p>
        <div className="pt-4 inline-flex items-center gap-2 px-5 py-3 rounded-2xl glass-card text-sm font-bold text-muted">
          <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
          In the works
        </div>
      </div>
    </div>
  )
}
