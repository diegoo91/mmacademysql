import { useEffect, useState } from 'react'
import { api } from './api.js'

/**
 * Money-driven payment preview — asks the server how an amount splits for a
 * player right now: how many existing unpaid sessions it covers (package
 * priced) and how many new sessions it credits.
 */
export function fetchPaymentPreview({ playerId, amount, excludeId } = {}) {
  if (!playerId) return Promise.resolve(null)
  const params = new URLSearchParams()
  params.set('player_id', String(playerId))
  if (amount !== undefined && amount !== null && amount !== '') params.set('amount', String(amount))
  if (excludeId) params.set('exclude_id', String(excludeId))
  return api.get(`/payments/preview?${params.toString()}`)
}

/**
 * Debounced preview for a payment form. Re-runs whenever player/amount (or
 * the payment being edited) changes.
 *   const { allocation } = useAllocationPreview({ playerId, amount })
 */
export function useAllocationPreview({ playerId, amount, excludeId, delay = 350 } = {}) {
  const [allocation, setAllocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const key = `${playerId || ''}|${amount ?? ''}|${excludeId || ''}`

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
      fetchPaymentPreview({ playerId, amount: amt, excludeId })
        .then((res) => { if (!cancelled) setAllocation(res) })
        .catch(() => { if (!cancelled) setAllocation(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, delay, playerId, amount, excludeId])

  return { allocation, loading }
}
