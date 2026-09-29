import db from '../db.js'
import { notifyUsers } from './notify.js'
import { parseDbTs } from './tournament.js'

export async function runTournamentSweep({ now = new Date() } = {}) {
  const open = await db.findAll('tournaments', (t) => t.status === 'registration_open')
  const closed = []
  for (const t of open) {
    const closesAt = parseDbTs(t.registration_close_at)
    if (!closesAt) continue
    if (closesAt >= now) continue
    await db.update('tournaments', t.id, { status: 'registration_closed' })
    closed.push(t.name || String(t.id))
    const signups = await db.findAll('tournament_signups', (s) =>
      s.tournament_id === t.id && s.status !== 'withdrawn' && s.status !== 'rejected')
    const playerIds = [...new Set(signups.flatMap((s) => [s.player1_id, s.player2_id]).filter(Boolean))]
    await notifyUsers(playerIds, {
      kind: 'tournament_signup_closed',
      title: 'Tournament signups closed',
      body: `Registration for "${t.name}" is closed. The draw is coming soon.`,
      link: '/tournament',
    })
    const admins = await db.findAll('users', (u) =>
      (u.role === 'admin' || u.role === 'superadmin') && u.account_status === 'active')
    await notifyUsers(admins.map((a) => a.id), {
      kind: 'tournament_signup_closed',
      title: 'Tournament signups auto-closed',
      body: `"${t.name}" registration closed automatically — ready to finalize teams.`,
      link: '/admin/tournament',
    })
  }
  return { closed }
}
