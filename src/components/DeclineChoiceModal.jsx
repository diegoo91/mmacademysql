import { CalendarClock, XCircle } from 'lucide-react'

/**
 * Shown when a player declines attendance.
 * choice 'modify' → request a different slot (admin modify flow)
 * choice 'cancel'  → straightforward decline/cancellation (existing behavior)
 */
export default function DeclineChoiceModal({ open, slot, loading, error, onChoose, onClose }) {
  if (!open || !slot) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-theme shadow-2xl p-6 space-y-5 animate-fadeIn">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-brand/10 border border-brand-text/30 text-brand-text flex items-center justify-center">
            <CalendarClock className="w-6 h-6" />
          </div>
          <h3 className="font-heading text-xl font-extrabold text-theme">
            Need a different slot?
          </h3>
          <p className="text-sm text-muted leading-relaxed">
            You declined <strong className="text-theme">{slot.date} at {slot.time}</strong> (Court {slot.court}).
            Would you like a different slot instead, or will you not be attending at all?
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-400 text-center">{error}</p>
        )}

        <div className="space-y-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => onChoose('modify')}
            className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CalendarClock className="w-4 h-4" />
            {loading === 'modify' ? 'Sending request…' : 'I want a different slot'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onChoose('cancel')}
            className="w-full py-3.5 rounded-xl bg-surface border border-theme text-theme font-bold text-sm transition-all hover:border-rose-400/50 hover:text-rose-400 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            {loading === 'cancel' ? 'Submitting…' : "I won't be attending"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-muted hover:text-theme transition-colors"
          >
            Keep my slot
          </button>
        </div>
      </div>
    </div>
  )
}
