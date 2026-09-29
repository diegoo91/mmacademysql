// Shared tournament frontend helpers — mirrors server/src/utils/tournament.js

export const SKILL_LEVELS = ['Beginners', 'Low D', 'D', 'Low C', 'C', 'B', 'A', 'Open']
export const BRACKET_SIZES = [4, 8, 16, 32, 64]
export const FORMATS = [
  { value: 'knockout', label: 'Knockout' },
  { value: 'groups_knockout', label: 'Groups to Knockout' },
]
export const MATCH_FORMATS = [
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
  { value: 'tiebreak', label: 'Tiebreak' },
]

export const STATUS = {
  draft: { label: 'Draft', cls: 'bg-slate-400/15 text-slate-500 dark:text-slate-400 border-slate-400/40' },
  registration_open: { label: 'Open', cls: 'bg-emerald-400/15 text-emerald-500 dark:text-emerald-400 border-emerald-400/40' },
  registration_closed: { label: 'Closed', cls: 'bg-gold/15 text-gold border-gold/40' },
  in_progress: { label: 'Live', cls: 'bg-sky-400/15 text-sky-500 dark:text-sky-400 border-sky-400/40' },
  completed: { label: 'Finished', cls: 'bg-brand/15 text-brand-text border-brand-text/40' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-500/15 text-rose-400 border-rose-400/40' },
}

export const SIGNUP_STATUS = {
  pending: { label: 'Pending', cls: 'bg-gold/15 text-gold border-gold/40' },
  approved: { label: 'Approved', cls: 'bg-emerald-400/15 text-emerald-500 dark:text-emerald-400 border-emerald-400/40' },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/15 text-rose-400 border-rose-400/40' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-400/15 text-slate-500 dark:text-slate-400 border-slate-400/40' },
}

export const PAYMENT_STATUS = {
  payment_pending: { label: 'Payment pending', cls: 'bg-gold/15 text-gold border-gold/40' },
  payment_approved: { label: 'Paid', cls: 'bg-emerald-400/15 text-emerald-500 dark:text-emerald-400 border-emerald-400/40' },
  payment_rejected: { label: 'Payment rejected', cls: 'bg-rose-500/15 text-rose-400 border-rose-400/40' },
}

export const MATCH_STATUS = {
  scheduled: { label: 'Scheduled', cls: 'bg-sky-400/15 text-sky-500 dark:text-sky-400 border-sky-400/40' },
  completed: { label: 'Final', cls: 'bg-brand/15 text-brand-text border-brand-text/40' },
  bye: { label: 'Bye', cls: 'bg-slate-400/15 text-slate-500 dark:text-slate-400 border-slate-400/40' },
  tbd: { label: 'Waiting', cls: 'bg-slate-400/15 text-slate-500 dark:text-slate-400 border-slate-400/40' },
}

// DB columns store naive UTC ('YYYY-MM-DD HH:MM:SS'); treat any value without
// an explicit offset as UTC so it matches the server's parseDbTs semantics.
export function parseDbTs(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const spaceIso = s.includes(' ')
    ? (/Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(' ', 'T') : s.replace(' ', 'T') + 'Z')
    : (/Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z')
  const d = new Date(spaceIso)
  return Number.isNaN(d.getTime()) ? null : d
}

// datetime-local input value (local tz) -> ISO string for the API
export function toApiDateTime(localStr) {
  if (!localStr) return null
  const d = new Date(localStr)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// DB value -> datetime-local input value (local tz)
export function toInputValue(v) {
  const d = parseDbTs(v)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDateTime(v) {
  const d = parseDbTs(v)
  if (!d) return '—'
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(v) {
  const d = parseDbTs(v)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function signupCap(t) {
  if (!t) return 0
  if (t.format === 'knockout') return Number(t.bracket_size) || 0
  return (Number(t.groups_count) || 0) * (Number(t.teams_per_group) || 0)
}

export function formatLabel(format) {
  return FORMATS.find((f) => f.value === format)?.label || format
}

export function matchFormatLabel(f) {
  return MATCH_FORMATS.find((m) => m.value === f)?.label || f
}

export function formatSummary(t) {
  if (!t) return ''
  if (t.format === 'knockout') return `${t.bracket_size}-team bracket`
  return `${t.groups_count} groups × ${t.teams_per_group} teams → top ${t.advance_per_group} (bracket ${t.bracket_size})`
}

export function statusPill(status, extraClass = '') {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-400/15 text-muted border-theme' }
  return `px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${s.cls} ${extraClass}`
}

export function roundLabel(roundNo, totalRounds) {
  const fromEnd = totalRounds - roundNo
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  return `Round ${roundNo}`
}
