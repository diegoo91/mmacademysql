import { Router } from 'express'
import db from '../db.js'
import { auditCreate } from '../middleware/audit.js'

const router = Router()

// POST /api/guest-booking-requests — public: guest self-booking request (no auth)
router.post('/', async (req, res) => {
  try {
    const { guest_name, guest_phone, guest_email, preferred_date, preferred_time, preferred_court, session_type, notes } = req.body

    if (!guest_name || !guest_phone) {
      return res.status(400).json({ error: 'guest_name and guest_phone are required' })
    }

    const request = await db.insert('booking_requests', {
      kind: 'guest_booking',
      player_id: null,
      player_name: guest_name,
      payload: JSON.stringify({
        guest_name, guest_phone, guest_email: guest_email || null,
        preferred_date: preferred_date || null,
        preferred_time: preferred_time || null,
        preferred_court: preferred_court || null,
        session_type: session_type || 'private',
        notes: notes || null,
      }),
      status: 'pending',
      created_by: null,
    })

    await auditCreate(req, 'guest_booking_request', request.id, {
      guest_name, guest_phone, preferred_date, preferred_time, session_type,
    })

    res.status(201).json({ ok: true, message: 'Your booking request has been submitted. We will contact you shortly.', request_id: request.id })
  } catch (err) {
    console.error('Guest booking request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/guest-booking-requests — admin: list pending guest requests
router.get('/', async (req, res) => {
  try {
    const all = await db.findAll('booking_requests', r => r.kind === 'guest_booking')
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json({ requests: all })
  } catch (err) {
    console.error('List guest requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
