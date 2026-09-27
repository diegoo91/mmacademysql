import { useState } from 'react'
import { Smartphone, X, Share } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { needsA2HS } from '../lib/push'

const DISMISS_KEY = 'mm_padel_a2hs_dismissed'

// iOS only delivers Web Push to an app launched from the Home Screen, so
// iPhone users get a one-time instruction to install the app first.
export default function A2HSBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  if (!user || dismissed || !needsA2HS()) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="bg-gradient-to-r from-brand/95 to-brand text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start gap-3">
        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">Install MM Padel Academy to get notifications</p>
          <p className="text-xs text-white/90 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>Tap</span>
            <Share className="w-3.5 h-3.5 inline-block" />
            <span>Share, then choose</span>
            <span className="font-semibold bg-white/20 px-1.5 py-0.5 rounded">Add to Home Screen</span>
            <span>and open it from your Home Screen.</span>
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install instructions"
          className="shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
