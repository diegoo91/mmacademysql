import { useEffect, useState } from 'react'
import { api } from './api.js'

/**
 * Money-driven payment preview — asks the server how an amount splits for a
 * player right now: how many existing unpaid sessions it covers (package
 * priced) and how many new sessions it credits. When explicit session counts
 * are given (admin override) the split is computed FOR THOSE totals instead,
 * including the conversion-aware covered/credit breakdown and a warning when
 * they diverge from what the amount itself derives.
 */
export function fetchPaymentPreview({ playerId, amount, excludeId, privateSessions, groupSessions } = {}) {
  if (!playerId) return Promise.resolve(null)
  const params = new URLSearchParams()
  params.set('player_id', String(playerId))
  if (amount !== undefined && amount !== null && amount !== '') params.set('amount', String(amount))
  if (excludeId) params.set('exclude_id', String(excludeId))
  if (privateSessions !== undefined && privateSessions !== null) params.set('private_sessions', String(privateSessions))
  if (groupSessions !== undefined && groupSessions !== null) params.set('group_sessions', String(groupSessions))
  return api.get(`/payments/preview?${params.toString()}`)
}

/**
 * Debounced preview for a payment form. Re-runs whenever player/amount (or
 * the payment being edited, or the typed counts) changes.
 *   const { allocation } = useAllocationPreview({ playerId, amount })
 * Pass privateSessions/groupSessions only when the counts are manually set —
 * the server then previews the entered split instead of deriving it.
 */
export function useAllocationPreview({ playerId, amount, excludeId, privateSessions, groupSessions, delay = 350 } = {}) {
  const [allocation, setAllocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const key = `${playerId || ''}|${amount ?? ''}|${excludeId || ''}|${privateSessions ?? ''}|${groupSessions ?? ''}`

  useEffect(() => {
    const amt = parseFloat(amount)
    if (!playerId || !amt || amt <= 0) {
      setAllocation(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      fetchPaymentPreview({ playerId, amount: amt, excludeId, privateSessions, groupSessions })
        .then((res) => { if (!cancelled) setAllocation(res) })
        .catch(() => { if (!cancelled) setAllocation(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, delay, playerId, amount, excludeId, privateSessions, groupSessions])

  return { allocation, loading }
}
