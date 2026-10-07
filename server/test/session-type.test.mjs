import test from 'node:test'
import assert from 'node:assert/strict'
import { countPlayerNames, resolveSessionType, classifySlotRepair, sessionTypeLabel, validatePlayerCount } from '../src/utils/sessionType.js'

const slot = (over = {}) => ({ player_text: '', session_type: null, booking_id: null, ...over })
const booking = (type) => (type ? { session_type: type } : null)

test('countPlayerNames handles separators and blanks', () => {
  assert.equal(countPlayerNames(''), 0)
  assert.equal(countPlayerNames('  '), 0)
  assert.equal(countPlayerNames(null), 0)
  assert.equal(countPlayerNames('Ahmed'), 1)
  assert.equal(countPlayerNames('Ahmed / Sara'), 2)
  assert.equal(countPlayerNames('Ahmed/Sara/Omar'), 3)
  assert.equal(countPlayerNames('Ahmed + Sara'), 2)
  assert.equal(countPlayerNames('Ahmed / / Sara'), 2)
})

test('resolveSessionType precedence: slot > booking > count > null', () => {
  assert.equal(resolveSessionType(slot({ session_type: 'group', player_text: 'Ahmed' })), 'group')
  assert.equal(resolveSessionType(slot({ player_text: 'Ahmed' }), booking('group')), 'group')
  assert.equal(resolveSessionType(slot({ player_text: 'Ahmed / Sara' })), 'group')
  assert.equal(resolveSessionType(slot({ player_text: 'Ahmed' })), 'private')
  assert.equal(resolveSessionType(slot({ player_text: 'Ahmed / Sara' }), booking('private')), 'private')
  assert.equal(resolveSessionType(slot()), null)
  assert.equal(resolveSessionType(slot({ session_type: 'weird', player_text: 'Ahmed' })), 'private')
})

test('sessionTypeLabel', () => {
  assert.equal(sessionTypeLabel('group'), 'Group')
  assert.equal(sessionTypeLabel('private'), 'Private')
  assert.equal(sessionTypeLabel(null), 'Session')
  assert.equal(sessionTypeLabel(undefined), 'Session')
})

// ── classifySlotRepair ──────────────────────────────────────────────────────

test('repair: empty slot is skipped, type stays untouched', () => {
  assert.deepEqual(classifySlotRepair({ slot: slot() }), { action: 'skip', reason: 'empty slot (no player text)' })
  assert.equal(classifySlotRepair({ slot: slot({ player_text: '   ' }) }).action, 'skip')
})

test('repair: missing type inferred from booking link', () => {
  const r = classifySlotRepair({ slot: slot({ player_text: 'Ahmed' }), booking: booking('group') })
  assert.equal(r.action, 'fix')
  assert.equal(r.next, 'group')
  assert.equal(r.tier, 'booking-link')
})

test('repair: missing type inferred from player count', () => {
  const g = classifySlotRepair({ slot: slot({ player_text: 'Ahmed / Sara' }) })
  assert.equal(g.action, 'fix'); assert.equal(g.next, 'group'); assert.equal(g.tier, 'player-count')
  const p = classifySlotRepair({ slot: slot({ player_text: 'Ahmed' }) })
  assert.equal(p.action, 'fix'); assert.equal(p.next, 'private'); assert.equal(p.tier, 'player-count')
})

test('repair: explicit private corrected to group when 2+ names, no booking', () => {
  const r = classifySlotRepair({ slot: slot({ player_text: 'Ahmed / Sara', session_type: 'private' }) })
  assert.equal(r.action, 'fix')
  assert.equal(r.next, 'group')
})

test('repair: conflict — booking private vs 2 names → exception, never changed', () => {
  const r = classifySlotRepair({ slot: slot({ player_text: 'Ahmed / Sara', session_type: 'private' }), booking: booking('private') })
  assert.equal(r.action, 'exception')
  assert.match(r.reason, /conflict/)
  const missing = classifySlotRepair({ slot: slot({ player_text: 'Ahmed / Sara' }), booking: booking('private') })
  assert.equal(missing.action, 'exception')
})

test('repair: group booking wins over a collapsed single-name player_text', () => {
  const missing = classifySlotRepair({ slot: slot({ player_text: 'Ahmed' }), booking: booking('group') })
  assert.equal(missing.action, 'fix')
  assert.equal(missing.next, 'group')
  const wrongPrivate = classifySlotRepair({ slot: slot({ player_text: 'Ahmed', session_type: 'private' }), booking: booking('group') })
  assert.equal(wrongPrivate.action, 'fix')
  assert.equal(wrongPrivate.next, 'group')
})

test('repair: explicit group never demoted, even with one name', () => {
  const r = classifySlotRepair({ slot: slot({ player_text: 'Ahmed', session_type: 'group' }) })
  assert.equal(r.action, 'skip')
  assert.match(r.reason, /kept explicit group/)
})

test('repair: >4 names is an exception', () => {
  const r = classifySlotRepair({ slot: slot({ player_text: 'A / B / C / D / E' }) })
  assert.equal(r.action, 'exception')
  assert.match(r.reason, /max 4/)
})

test('repair: already-correct rows are ok (idempotent)', () => {
  assert.equal(classifySlotRepair({ slot: slot({ player_text: 'Ahmed', session_type: 'private' }) }).action, 'ok')
  assert.equal(classifySlotRepair({ slot: slot({ player_text: 'A / B', session_type: 'group' }) }).action, 'ok')
  assert.equal(classifySlotRepair({ slot: slot({ player_text: 'Ahmed', session_type: 'private' }), booking: booking('private') }).action, 'ok')
})

test('validatePlayerCount: private allows 1, rejects 2+', () => {
  assert.equal(validatePlayerCount(['Ahmed'], 'private'), null)
  assert.equal(validatePlayerCount([], 'private'), null)
  assert.match(validatePlayerCount(['Ahmed', 'Sara'], 'private'), /only have 1 player/)
})

test('validatePlayerCount: group requires 2-4', () => {
  assert.equal(validatePlayerCount(['A', 'B'], 'group'), null)
  assert.equal(validatePlayerCount(['A', 'B', 'C', 'D'], 'group'), null)
  assert.match(validatePlayerCount(['A'], 'group'), /2-4 players/)
  assert.match(validatePlayerCount(['A', 'B', 'C', 'D', 'E'], 'group'), /2-4 players/)
})

test('validatePlayerCount: hard cap of 4 names', () => {
  assert.match(validatePlayerCount(['A', 'B', 'C', 'D', 'E'], null), /Maximum 4/)
})
