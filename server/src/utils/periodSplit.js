import db from '../db.js'

/**
 * Period-statement attribution — MEMO ONLY, never touches balances or the
 * paid status of anything (that stays owned by sessionPaid.js / the app).
 *
 * Reproduces the pooled paid-FIFO of sessionPaid.js per player, but tracks
 * credit PER PAYMENT (oldest payment first) so every covered slot is tagged
 * with the payment(s) that paid it. This powers, for one date window:
 *   - prepay memo: each in-window payment's amount split pro-rata across
 *     pre-period (arrears) / in-period / future-scheduled sessions and
 *     unclaimed credit (1P = 2G weight, so the parts sum to the amount),
 *   - packages sold: in-window payments whose (P, G) counts form a named
 *     tier pack (4/8/12/16 P, 4/8/16 G, mixed pairs like 16P+8G),
 *   - private sessions without package: in-window private sessions that are
 *     paid but NOT covered by a named pack (singles, odd mixes, direct
 *     booking-flagged slots).
 *
 * Deliberately duplicates the entry construction of sessionPaid.js
 * (computePlayerSessions) instead of importing it — that file is under
 * concurrent edit by another workstream; semantics are mirrored by comment.
 * Booking-linked payments stay in the pool exactly like the engine does;
 * their own slots are externally paid (bypass the pool), so their credit
 * flows to other slots — same as the app's behavior.
 */

export const WEIGHT_PRIVATE = 2 // locked conversion 1P = 2G
const PACK_PRIVATE_TIERS = [4, 8, 12, 16]
const PACK_GROUP_TIERS = [4, 8, 16]

/** Named-tier pack per the locked price list (mixed pairs allowed). */
export function isNamedPack(privateCount, groupCount) {
  const p = Number(privateCount) || 0
  const g = Number(groupCount) || 0
  if (p === 0 && g === 0) return false
  return (p === 0 || PACK_PRIVATE_TIERS.includes(p)) && (g === 0 || PACK_GROUP_TIERS.includes(g))
}

function bucketOf(date, from, to) {
  if (from && date < from) return 'pre'
  if (to && date > to) return 'fut'
  return 'in'
}

/**
 * @param {{ from: string|null, to: string|null }} range - window (payment
 *        memos/packs are filtered by payment date; session buckets by slot date)
 * @returns {{
 *   prepay: { payments: Array, totals: { received, for_period, for_future, prepay, arrears } },
 *   packages: { count, sessions, value },
 *   privateSplit: { package: { count, egp }, without: { count, egp } },
 * }}
 */
export async function buildPeriodSplit({ from, to }) {
  const [allSlots, allPayments, allBookings, players] = await Promise.all([
    db.findAll('slots'),
    db.findAll('payments'),
    db.findAll('bookings'),
    db.findAll('users', u => u.role === 'player'),
  ])
  const bookingById = new Map(allBookings.map(b => [b.id, b]))
  const approved = allPayments.filter(p => p.status === 'payment_approved')

  const memos = []
  const packages = { count: 0, sessions: 0, value: 0 }
  const privPackage = { count: 0, egp: 0 }
  const privWithout = { count: 0, egp: 0 }

  for (const player of players) {
    const pname = (player.name || '').toLowerCase()
    const slots = allSlots
      .filter(s => s.player_text && s.player_text.split(/[/+]/).map(n => n.trim().toLowerCase()).includes(pname))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))

    // Pool = all approved rows, same set computePlayerSessions pools.
    const rows = approved
      .filter(p => p.player_id === player.id)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.id || 0) - (b.id || 0))
    const pool = rows.map((row, i) => {
      const op = parseInt(row.private_sessions, 10) || 0
      const og = parseInt(row.group_sessions, 10) || 0
      return {
        i,
        row,
        op, og,
        p: op, g: og, // live pool, mutated by the walk
        w0: op * WEIGHT_PRIVATE + og,
        buckets: { pre: 0, in: 0, fut: 0 },
      }
    })
    if (!pool.length && !slots.length) continue

    let totalP = pool.reduce((s, x) => s + x.p, 0)
    let totalG = pool.reduce((s, x) => s + x.g, 0)
    const firstDonor = (type) => pool.find(x => (type === 'p' ? x.p > 0 : x.g > 0))

    for (const slot of slots) {
      const booking = slot.booking_id ? bookingById.get(slot.booking_id) : null
      const directPayment = booking ? approved.find(p => p.booking_id === booking.id) : null
      // mirrored from sessionPaid.js: externally paid slots bypass the pool
      const externallyPaid = !!(directPayment || booking?.paid || slot.status === 'payment_approved')
      const type = slot.session_type === 'group' ? 'group' : 'private'
      const names = [...new Set(String(slot.player_text).split(/[/+]/).map(n => n.trim().toLowerCase()).filter(Boolean))]

      if (externallyPaid) {
        classifySlot(names, null, type, privPackage, privWithout, pool)
        continue
      }
      // no pool credit left → unpaid: belongs only to #6, classified nowhere
      if (totalP <= 0 && totalG <= 0) continue

      const b = bucketOf(String(slot.date), from, to)
      const covers = []
      if (type === 'private') {
        if (totalP > 0) {
          const donor = firstDonor('p')
          donor.p -= 1; totalP -= 1
          donor.buckets[b] += WEIGHT_PRIVATE
          covers.push({ pi: donor.i, w: WEIGHT_PRIVATE })
        } else if (totalG >= 2) {
          let need = 2
          while (need > 0) {
            const donor = firstDonor('g')
            const take = Math.min(need, donor.g)
            donor.g -= take; totalG -= take; need -= take
            donor.buckets[b] += take
            covers.push({ pi: donor.i, w: take })
          }
        }
      } else {
        if (totalG > 0) {
          const donor = firstDonor('g')
          donor.g -= 1; totalG -= 1
          donor.buckets[b] += 1
          covers.push({ pi: donor.i, w: 1 })
        } else if (totalP > 0) {
          // conversion 1P → 2G, slot uses one: debit 1P, return +1G (credit)
          const donor = firstDonor('p')
          donor.p -= 1; totalP -= 1; donor.g += 1; totalG += 1
          donor.buckets[b] += 1
          covers.push({ pi: donor.i, w: 1 })
        }
      }
      if (covers.length) classifySlot(names, covers, type, privPackage, privWithout, pool)
    }

    // per-payment memo (window payments only) + pack aggregation
    for (const x of pool) {
      const date = String(x.row.date || '')
      const inWindow = (!from || date >= from) && (!to || date <= to)
      if (!inWindow) continue
      const amount = Number(x.row.amount) || 0
      let period, future, arrears, prepay
      if (x.w0 > 0) {
        // pro-rata by consumed weight (1P = 2G); remainder lands in prepay so
        // the four parts always sum to the amount exactly
        period = Math.round(amount * x.buckets.in / x.w0)
        future = Math.round(amount * x.buckets.fut / x.w0)
        arrears = Math.round(amount * x.buckets.pre / x.w0)
        prepay = amount - period - future - arrears
      } else {
        // no session credit bought (non-session payment) → all period revenue
        period = amount; future = 0; arrears = 0; prepay = 0
      }
      const pack = isNamedPack(x.op, x.og)
      memos.push({
        id: x.row.id,
        ref: x.row.ref,
        date,
        player_id: player.id,
        player: player.name,
        amount,
        private_sessions: x.op,
        group_sessions: x.og,
        pack,
        for_period: period,
        for_future: future,
        prepay,
        arrears,
      })
      if (pack) {
        packages.count += 1
        packages.sessions += x.op + x.og
        packages.value += amount
      }
    }
  }

  memos.sort((a, b) => a.date.localeCompare(b.date) || (a.id || 0) - (b.id || 0))
  const totals = memos.reduce((t, m) => ({
    received: t.received + m.amount,
    for_period: t.for_period + m.for_period,
    for_future: t.for_future + m.for_future,
    prepay: t.prepay + m.prepay,
    arrears: t.arrears + m.arrears,
  }), { received: 0, for_period: 0, for_future: 0, prepay: 0, arrears: 0 })

  return {
    prepay: { payments: memos, totals },
    packages,
    privateSplit: { package: privPackage, without: privWithout },
  }
}

/**
 * Attribute one paid private slot to the package vs without-package buckets.
 * `covers` = [{pi, w}] donor weights, or null for externally-paid slots.
 * EGP = pro-rata share of the donor payment(s) of the same pack-ness
 * (external slots carry no pool EGP — their booking cash already shows in
 * payments received; this avoids double counting).
 */
function classifySlot(names, covers, type, privPackage, privWithout, pool) {
  if (type !== 'private' || !names.length) return
  const attendees = names.length
  if (!covers || !covers.length) {
    privWithout.count += attendees // paid directly (booking flag), not via any pack
    return
  }
  const isPackCover = (c) => isNamedPack(pool[c.pi].op, pool[c.pi].og)
  // primary donor decides pack-ness (max weight, earliest on tie)
  let primary = covers[0]
  for (const c of covers) {
    if (c.w > primary.w || (c.w === primary.w && c.pi < primary.pi)) primary = c
  }
  const share = (c) => {
    const donor = pool[c.pi]
    if (donor.w0 <= 0) return 0
    return (Number(donor.row.amount) || 0) * c.w / donor.w0
  }
  const perAttendee = (pred) => covers.filter(pred).reduce((s, c) => s + share(c), 0) / attendees
  if (isPackCover(primary)) {
    privPackage.count += attendees
    privPackage.egp += Math.round(perAttendee(isPackCover))
  } else {
    privWithout.count += attendees
    privWithout.egp += Math.round(perAttendee(c => !isPackCover(c)))
  }
}
