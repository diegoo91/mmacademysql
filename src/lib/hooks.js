import { useEffect } from 'react'

/**
 * Calls handler when Escape is pressed while enabled.
 * Use for closing modals/dialogs (adds keyboard dismissal).
 */
export function useEscapeKey(handler, enabled = true) {
  useEffect(() => {
    if (!enabled || !handler) return
    const onKey = (e) => { if (e.key === 'Escape') handler(e) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler, enabled])
}
