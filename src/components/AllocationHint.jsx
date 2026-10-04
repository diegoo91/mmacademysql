const fmt = (n) => (Number(n) || 0).toLocaleString('en-EG')

/**
 * Breakdown line under the amount field of a payment form:
 * what the money covers (existing unpaid sessions, package priced) and what
 * it adds as new sessions — conversion-aware (1P = 2G), computed with the
 * session counts currently in the form. Purely informational — the server
 * re-derives the same numbers when the payment is saved.
 */
export function AllocationHint({ allocation }) {
  if (!allocation) return null

  const owed = allocation.amount_owed || 0
  const coveredP = allocation.covered_private || 0
  const coveredG = allocation.covered_group || 0
  const creditP = allocation.credit_private || 0
  const creditG = allocation.credit_group || 0
  const covered = coveredP + coveredG > 0
  const credit = creditP + creditG > 0
  const remaining = allocation.remaining_unpaid || {}
  const remainingCount = (remaining.private || 0) + (remaining.group || 0)

  if (owed === 0 && !credit && !allocation.warning) return null

  return (
    <div className="mt-2 text-[11px] leading-relaxed rounded-lg border border-brand-text/20 bg-brand/5 px-3 py-2 text-muted">
      <div className="flex flex-wrap gap-x-3">
        {owed > 0 && <span className="font-bold text-theme">Owed: EGP {fmt(owed)}</span>}
        {covered && <span className="text-amber-500 font-semibold">Covers {coveredP}P / {coveredG}G unpaid (EGP {fmt(allocation.covered_value || 0)})</span>}
        {credit && <span className="text-emerald-400 font-semibold">Adds {creditP}P / {creditG}G to balance</span>}
        {!covered && owed > 0 && <span className="text-muted">Nothing applied to unpaid sessions</span>}
      </div>
      {remainingCount > 0 && (
        <div className="mt-0.5 text-rose-400 font-semibold">
          Still unpaid after this: {remaining.private || 0}P / {remaining.group || 0}G (EGP {fmt(remaining.amount || 0)})
        </div>
      )}
      {owed === 0 && credit && !allocation.warning && (
        <div className="mt-0.5 text-muted">No unpaid sessions — the full amount is credited to the balance.</div>
      )}
      {allocation.warning && (
        <div className="mt-0.5 text-amber-400 font-semibold">
          {allocation.warning} The split above uses your entered counts (1P = 2G conversion applied).
        </div>
      )}
    </div>
  )
}
