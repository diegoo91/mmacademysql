import db from '../db.js'
import { sendPushToUser } from './push.js'

// Single funnel for user-facing notifications:
//   1. persist the in-app notification row (bell dropdown)
//   2. best-effort Web Push to every registered device of that user
// Push delivery must NEVER break the action that triggered the notification.
export async function notifyUser({ userId, kind = 'info', title, body = '', link = null }) {
  if (!userId || !title) return null
  const created = await db.insert('notifications', {
    user_id: Number(userId),
    kind,
    title,
    body: body || '',
    link: link || null,
    read: 0,
  })
  sendPushToUser(userId, {
    title,
    body: body || '',
    url: link || '/',
    kind,
    tag: `${kind}-${userId}`,
  }).catch(err => console.warn('web push failed:', err?.message || err))
  return created
}

// Fan-out to several users with one payload.
export async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))]
  if (!ids.length || !payload?.title) return null
  const results = await Promise.allSettled(ids.map(userId => notifyUser({ ...payload, userId })))
  return results.filter(r => r.status === 'fulfilled').length
}
