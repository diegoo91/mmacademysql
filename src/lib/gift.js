import { api } from './api'

/**
 * Gift unpaid sessions to a player at 0 EGP.
 *
 * The unpaid report is driven purely by payment rows (paid-FIFO over
 * payment session counts), so the only way to clear "unpaid sessions" is to
 * record sessions against the player. This posts a Cash payment for exactly
 * the unpaid counts — Cash auto-approves, so it credits immediately and the
 * settle-then-credit rule absorbs any negative balance first.
 *
 * amount stays 0: this is a gift, no money changed hands.
 */
export async function giftUnpaidSessions({ playerId, playerName, unpaidPrivate, unpaidGroup }) {
  const priv = Number(unpaidPrivate) || 0
  const grp = Number(unpaidGroup) || 0
  if (!playerId || !playerName) throw new Error('Player is required')
  if (priv + grp <= 0) throw new Error('No unpaid sessions to gift')

  return api.post('/payments', {
    date: new Date().toISOString().slice(0, 10),
    player_name: playerName,
    player_id: Number(playerId),
    method: 'Cash',
    amount: 0,
    private_sessions: priv,
    group_sessions: grp,
    notes: `Gift — ${priv} private + ${grp} group unpaid session(s) forgiven at 0 EGP`,
  })
}

/**
 * Confirm dialog shared by every surface that offers the gift action.
 * Takes the confirm fn from useFeedback() so the prompt is an in-app modal.
 */
export function confirmGift(confirm, { playerName, priv, grp, amountOwed }) {
  const total = Number(priv) + Number(grp)
  return confirm({
    title: `Gift ${total} unpaid session${total === 1 ? '' : 's'}?`,
    description: `This clears ${playerName} from the Unpaid Players report. Any negative balance is settled first.`,
    details: `${priv} private + ${grp} group\nAmount: EGP 0 (no money recorded)\nOwed now: EGP ${Number(amountOwed || 0).toLocaleString()}`,
    confirmLabel: 'Gift sessions',
    tone: 'success',
  })
}
