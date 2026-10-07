// Session-type helpers — single source of truth for private/group resolution.
//
// resolveSessionType(slot, booking):
//   explicit slot.type > explicit booking.type > player-count inference > null
//   (null = genuinely unknown: empty/admin slot or malformed player_text)
//
// classifySlotRepair({ slot, booking }) — decision for the historical repair
// script (repair-slot-session-types.mjs). Rules approved for the global backfill:
//   - empty slot (no player names)             -> keep null   (correct as-is)
//   - >4 names                                 -> exception   (malformed)
//   - booking says private but player_text has 2+ names
//                                             -> exception   (conflict)
//   - a linked group booking always wins (player_text may be collapsed)
//   - otherwise effective = bookingType || countType
//   - otherwise effective = bookingType || countType
//       slot type === effective                -> ok
//       slot type missing                      -> fix (missing)
//       slot type 'private', effective 'group' -> fix (mismatch)
//       slot type 'group',  effective 'private'-> keep  (never demote an
//         explicit group: booking edits may have collapsed player_text)

export const VALID_TYPES = ['private', 'group']

export function countPlayerNames(playerText) {
  if (!playerText || !String(playerText).trim()) return 0
  return String(playerText).split(/[/+]/).map(n => n.trim()).filter(Boolean).length
}

export function isValidType(t) {
  return t === 'private' || t === 'group'
}

/** Canonical session type for a slot. Returns null when genuinely unknown. */
export function resolveSessionType(slot, booking = null) {
  if (isValidType(slot?.session_type)) return slot.session_type
  if (isValidType(booking?.session_type)) return booking.session_type
  const names = countPlayerNames(slot?.player_text)
  if (names >= 2) return 'group'
  if (names === 1) return 'private'
  return null
}

export function sessionTypeLabel(t) {
  if (t === 'group') return 'Group'
  if (t === 'private') return 'Private'
  return 'Session'
}

/**
 * Repair decision for one slot.
 * @returns {{action:'ok'|'skip'|'fix'|'exception', reason:string, next?:'private'|'group', tier?:string}}
 *   skip    — leave unchanged on purpose (empty slot / demote-guard)
 *   fix     — safe to update automatically
 *   exception — report for manual admin review, never auto-change
 */
export function classifySlotRepair({ slot, booking = null }) {
  const names = countPlayerNames(slot?.player_text)
  const current = isValidType(slot?.session_type) ? slot.session_type : null
  const bookingType = isValidType(booking?.session_type) ? booking.session_type : null

  if (names === 0) {
    // Empty/admin slot — NULL is the correct value (or it holds a stale type
    // on a cleared cell; both are outside this repair's scope).
    return { action: 'skip', reason: 'empty slot (no player text)' }
  }
  if (names > 4) {
    return { action: 'exception', reason: `${names} player names in player_text (max 4)` }
  }

  const countType = names >= 2 ? 'group' : 'private'
  if (bookingType === 'private' && countType === 'group') {
    return {
      action: 'exception',
      reason: `conflict: booking says private but player_text has ${names} names`,
    }
  }

  // A group booking is authoritative even with one visible name (booking
  // session edits can collapse "A / B" into a single player_text).
  const effective = bookingType || countType
  const tier = bookingType ? 'booking-link' : 'player-count'

  if (current === effective) return { action: 'ok', reason: 'already correct' }
  if (current === null) return { action: 'fix', reason: `missing type -> ${effective}`, next: effective, tier }
  if (current === 'private' && effective === 'group') {
    return { action: 'fix', reason: `private -> group (${tier})`, next: 'group', tier }
  }
  // current === 'group' && effective === 'private'
  return { action: 'skip', reason: 'kept explicit group (player_text may be collapsed)', tier }
}
