// Coaching journey — shared constants, assessment templates and score math.
// Templates are seeded once by ensureJourneyTables() in index.js (boot).
// Pillar / section / name order below IS the canonical assessment structure.

export const PILLARS = [
  { id: 1, label: 'Shots' },
  { id: 2, label: 'Fitness & Physical Capability' },
  { id: 3, label: 'Movement & Footwork' },
  { id: 4, label: 'Situation & Game Intelligence' },
]

export const PILLAR_LABELS = Object.fromEntries(PILLARS.map(p => [p.id, p.label]))

// [pillar, section, name]
const RAW_TEMPLATES = [
  // ── Pillar 1: Shots ────────────────────────────────────────────────
  [1, 'Starts & Baseline Foundations', 'Serve'],
  [1, 'Starts & Baseline Foundations', 'Return of Serve'],
  [1, 'Starts & Baseline Foundations', 'Forehand Drive'],
  [1, 'Starts & Baseline Foundations', 'Backhand Drive'],
  [1, 'Net Control & Resets', 'Lob'],
  [1, 'Net Control & Resets', 'Forehand Volley'],
  [1, 'Net Control & Resets', 'Backhand Volley'],
  [1, 'Net Control & Resets', 'Chiquita'],
  [1, 'Overheads', 'Bandeja'],
  [1, 'Overheads', 'Víbora'],
  [1, 'Overheads', 'Smash (Por Tres / Por Cuatro)'],
  [1, 'Overheads', 'Gancho (Hook)'],
  [1, 'Wall & Finesse Shots', 'Bajada de Pared'],
  [1, 'Wall & Finesse Shots', 'Salida de Pared'],
  [1, 'Wall & Finesse Shots', 'Contra Pared'],
  [1, 'Wall & Finesse Shots', 'Dejada (Drop Shot)'],
  [1, 'Wall & Finesse Shots', 'La Dormilona'],
  [1, 'Technical Metrics', 'Unforced Error Ratio'],
  [1, 'Technical Metrics', 'Winners-to-Errors Ratio'],
  // ── Pillar 2: Fitness & Physical Capability ────────────────────────
  [2, 'Fitness & Physical Capability', 'Core Stability & Rotation'],
  [2, 'Fitness & Physical Capability', 'Deceleration & Recovery'],
  [2, 'Fitness & Physical Capability', 'Repeat Sprint Ability'],
  [2, 'Fitness & Physical Capability', 'Stamina / Late-Match Consistency'],
  // ── Pillar 3: Movement & Footwork ──────────────────────────────────
  [3, 'Movement & Footwork', 'Split-Step Timing'],
  [3, 'Movement & Footwork', 'Low Center of Gravity'],
  [3, 'Movement & Footwork', 'Net-Back Court Transitions'],
  [3, 'Movement & Footwork', 'Chassé Steps'],
  [3, 'Movement & Footwork', 'Partner Synchronization'],
  // ── Pillar 4: Situation & Game Intelligence ────────────────────────
  [4, 'Situation & Game Intelligence', 'Shot Selection / Decision-Making'],
  [4, 'Situation & Game Intelligence', 'Patience in Building Points'],
  [4, 'Situation & Game Intelligence', 'Net Control Ownership'],
  [4, 'Situation & Game Intelligence', 'Targeting & Pattern Recognition'],
  [4, 'Situation & Game Intelligence', 'Clutch Point Execution'],
]

export const JOURNEY_TEMPLATES = RAW_TEMPLATES.map(([pillar, section, name], i) => ({
  pillar, section, name, sort_order: i + 1, active: 1, description: null,
}))

export const TEMPLATE_COUNT = JOURNEY_TEMPLATES.length // 33
export const MAX_REPORTS_DEFAULT = 10

export const ASSESSMENT_STATUSES = ['draft', 'submitted', 'in-review', 'returned', 'reviewed', 'published']
export const MONTHLY_STATUSES = ['draft', 'in-review', 'returned', 'reviewed', 'published']

export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted for Review',
  'in-review': 'In Review',
  returned: 'Returned for Changes',
  reviewed: 'Reviewed',
  published: 'Published',
}

// Whole numbers 1..10 only (drafts may leave scores null).
export const isWholeScore = (v) => Number.isInteger(v) && v >= 1 && v <= 10

export const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10

function avg(nums) {
  if (!nums.length) return null
  return round1(nums.reduce((s, n) => s + n, 0) / nums.length)
}

// Score used for display: final wins; drafts fall back to admin, then user.
// score_source tells the UI which lens it is looking at.
function scoreOf(item) {
  if (isWholeScore(item.final_score)) return { value: item.final_score, source: 'final' }
  if (isWholeScore(item.admin_score)) return { value: item.admin_score, source: 'admin' }
  if (isWholeScore(item.user_score)) return { value: item.user_score, source: 'user' }
  return { value: null, source: null }
}

// Overall + per-pillar averages over the given items (any item shape that
// carries final_score/admin_score/user_score + template_id).
export function computeMetrics(items, templates) {
  const pillarOf = new Map(templates.map(t => [t.id, t.pillar]))
  const values = []
  const byPillar = new Map()
  let source = null
  for (const item of items) {
    const { value, source: s } = scoreOf(item)
    if (value === null) continue
    values.push(value)
    if (!source) source = s
    const pillar = pillarOf.get(item.template_id)
    if (!pillar) continue
    if (!byPillar.has(pillar)) byPillar.set(pillar, [])
    byPillar.get(pillar).push(value)
  }
  const pillar_averages = {}
  for (const p of PILLARS) pillar_averages[p.id] = avg(byPillar.get(p.id) || [])
  return { overall_score: avg(values), pillar_averages, score_source: source }
}

// Journey progress = published monthly reports / maximum * 100.
export function journeyProgress(publishedCount, maxReports) {
  const max = Math.max(1, Number(maxReports) || MAX_REPORTS_DEFAULT)
  return Math.min(100, Math.round((Number(publishedCount) || 0) / max * 100))
}
