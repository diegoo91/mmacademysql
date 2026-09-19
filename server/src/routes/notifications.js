import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  try {
    const notifications = (await db.findAll('notifications', n => n.user_id === req.user.id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50)
    const unread = notifications.filter(n => !n.read).length
    res.json({ notifications, unread })
  } catch (err) {
    console.error('List notifications error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id/read', async (req, res) => {
  try {
    const n = await db.get('notifications', parseInt(req.params.id))
    if (!n || n.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const updated = await db.update('notifications', parseInt(req.params.id), { read: 1 })
    res.json(updated)
  } catch (err) {
    console.error('Read notification error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/read-all', async (req, res) => {
  try {
    const all = await db.findAll('notifications', n => n.user_id === req.user.id && !n.read)
    for (const n of all) {
      await db.update('notifications', n.id, { read: 1 })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Read all notifications error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
