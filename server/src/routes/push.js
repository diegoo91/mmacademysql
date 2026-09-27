import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { getVapidPublicKey, pushEnabled, saveSubscription, removeSubscription } from '../utils/push.js'

const router = Router()

// Public: the VAPID applicationServerKey needed to subscribe. Not a secret.
router.get('/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey()
  if (!publicKey) return res.json({ enabled: false, publicKey: null })
  res.json({ enabled: true, publicKey })
})

router.use(authenticate)

router.get('/status', async (req, res) => {
  try {
    const subs = await db.findAll('push_subscriptions', s => s.user_id === req.user.id)
    res.json({ enabled: pushEnabled(), subscribed: subs.length > 0, devices: subs.length })
  } catch (err) {
    console.error('Push status error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/subscribe', async (req, res) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Push notifications are not configured' })
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription payload' })
    }
    const row = await saveSubscription(req.user.id, { endpoint, keys }, req.headers['user-agent'])
    res.json({ ok: true, id: row?.id ?? null })
  } catch (err) {
    console.error('Push subscribe error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {}
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })
    await removeSubscription(req.user.id, endpoint)
    res.json({ ok: true })
  } catch (err) {
    console.error('Push unsubscribe error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
