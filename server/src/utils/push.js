import webpush from 'web-push'
import db from '../db.js'

let configured = false
let setVapidError = null

function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

function ensureVapid() {
  if (configured) return true
  const v = vapid()
  if (!v) return false
  try {
    webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
    configured = true
    return true
  } catch (err) {
    setVapidError = err.message
    configured = false
    return false
  }
}

export function getVapidPublicKey() {
  return vapid()?.publicKey || null
}

export function pushEnabled() {
  return Boolean(getVapidPublicKey())
}

export async function saveSubscription(userId, subscription, userAgent = '') {
  const endpoint = subscription?.endpoint
  if (!endpoint) throw new Error('Missing endpoint')
  const record = {
    user_id: Number(userId),
    endpoint,
    p256dh: subscription.keys?.p256dh || '',
    auth: subscription.keys?.auth || '',
    user_agent: String(userAgent || '').slice(0, 300),
  }
  const existing = await db.find('push_subscriptions', s => s.endpoint === endpoint)
  if (existing) {
    // endpoint can be re-subscribed by a different account on the same browser
    const patch = { ...record, user_id: existing.user_id === record.user_id ? existing.user_id : record.user_id }
    return db.update('push_subscriptions', existing.id, patch)
  }
  return db.insert('push_subscriptions', record)
}

export async function removeSubscription(userId, endpoint) {
  const rows = await db.findAll('push_subscriptions', s => s.endpoint === endpoint)
  for (const row of rows) {
    if (row.user_id === Number(userId) || !userId) await db.remove('push_subscriptions', row.id)
  }
  return true
}

async function dropSubscription(id) {
  try { await db.remove('push_subscriptions', id) } catch { /* ignore */ }
}

function toWebPushSubscription(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
}

async function sendToSubscription(row, payload) {
  try {
    await webpush.sendNotification(toWebPushSubscription(row), JSON.stringify(payload))
    return true
  } catch (err) {
    const status = err?.statusCode
    // 404/410 = subscription expired/revoked by the browser; 400/413 = malformed.
    if (status === 404 || status === 410 || status === 400) {
      await dropSubscription(row.id)
      return false
    }
    console.warn(`web-push send failed (${status || 'network'}):`, err?.message || err)
    return false
  }
}

// Fire-and-forget delivery: never throws, never blocks the caller.
export function sendPushToUser(userId, payload) {
  return deliver([Number(userId)], payload)
}

export function sendPushToUsers(userIds, payload) {
  return deliver([...new Set(userIds.filter(Boolean).map(Number))], payload)
}

async function deliver(userIds, payload) {
  if (!userIds.length || !payload?.title) return 0
  if (!ensureVapid()) {
    if (setVapidError) console.warn('web-push not configured:', setVapidError)
    return 0
  }
  let subs = []
  try {
    subs = await db.findAll('push_subscriptions', s => userIds.includes(Number(s.user_id)))
  } catch (err) {
    console.warn('push subscriptions lookup failed:', err.message)
    return 0
  }
  if (!subs.length) return 0
  const results = await Promise.allSettled(subs.map(row => sendToSubscription(row, payload)))
  return results.filter(r => r.status === 'fulfilled' && r.value === true).length
}
