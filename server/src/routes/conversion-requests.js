import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

function notify(userId, kind, title, body, link) {
  if (!userId) return
  db.insert('notifications', { user_id: userId, kind, title, body, link: link || null, read: 0 })
}

router.post('/', (req, res) => {
  try {
    if (req.user.role !== 'player' && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only players can submit conversion requests' })
    }
    const { from, to, count } = req.body
    if (!from || !to || !count || count <= 0) return res.status(400).json({ error: 'Invalid request params' })
    if (from === to) return res.status(400).json({ error: 'Cannot convert same type' })

    const user = db.get('users', req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const privBalance = user.private_balance || 0
    const grpBalance = user.group_balance || 0

    if (from === 'private' && count > privBalance) return res.status(400).json({ error: `Insufficient private balance (${privBalance} available)` })
    if (from === 'group' && count * 2 > grpBalance) return res.status(400).json({ error: `Insufficient group balance (${grpBalance} available, need ${count * 2})` })

    const admins = db.findAll('users', u => u.role === 'superadmin' || u.role === 'admin')
    const request = db.insert('conversion_requests', {
      user_id: req.user.id,
      user_name: req.user.name,
      from,
      to,
      count: parseInt(count),
      status: 'pending',
    })

    for (const admin of admins) {
      notify(admin.id, 'conversion_request', 'Conversion Request', `${req.user.name} requests to convert ${count} ${from} → ${to}.`, '/admin/bookings')
    }

    res.status(201).json(request)
  } catch (err) {
    console.error('Create conversion request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const { status } = req.query
    let all = db.findAll('conversion_requests')
    if (status) all = all.filter(r => r.status === status)
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json(all)
  } catch (err) {
    console.error('List conversion requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id/approve', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const request = db.get('conversion_requests', parseInt(req.params.id))
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' })

    const user = request.user_id ? db.get('users', request.user_id) : null
    if (!user) return res.status(404).json({ error: 'User not found' })

    const privBalance = user.private_balance || 0
    const grpBalance = user.group_balance || 0

    if (request.from === 'private' && request.to === 'group') {
      if (privBalance < request.count) return res.status(400).json({ error: 'Insufficient credits' })
      db.update('users', user.id, {
        private_balance: privBalance - request.count,
        group_balance: grpBalance + request.count * 2,
      })
    } else if (request.from === 'group' && request.to === 'private') {
      if (grpBalance < request.count * 2) return res.status(400).json({ error: 'Insufficient credits' })
      db.update('users', user.id, {
        group_balance: grpBalance - request.count * 2,
        private_balance: privBalance + request.count,
      })
    }

    db.update('conversion_requests', parseInt(req.params.id), { status: 'approved' })

    if (request.user_id) {
      notify(request.user_id, 'conversion_approved', 'Conversion Approved', `Your request to convert ${request.count} ${request.from} → ${request.to} has been approved.`, '/profile')
    }

    const updated = db.get('conversion_requests', parseInt(req.params.id))
    res.json(updated)
  } catch (err) {
    console.error('Approve conversion request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id/reject', requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const request = db.get('conversion_requests', parseInt(req.params.id))
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' })

    db.update('conversion_requests', parseInt(req.params.id), { status: 'rejected' })

    if (request.user_id) {
      notify(request.user_id, 'conversion_rejected', 'Conversion Rejected', `Your request to convert ${request.count} ${request.from} → ${request.to} has been rejected.`, '/profile')
    }

    const updated = db.get('conversion_requests', parseInt(req.params.id))
    res.json(updated)
  } catch (err) {
    console.error('Reject conversion request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
