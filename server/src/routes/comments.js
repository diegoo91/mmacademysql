import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { validateLength, LIMITS } from '../middleware/validation.js'
import { auditCreate, auditUpdate, auditDelete } from '../middleware/audit.js'

const router = Router()

// Public: get approved comments
router.get('/', async (req, res) => {
  try {
    const comments = await db.findAll('comments', c => c.status === 'approved')
    comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json(comments)
  } catch (err) {
    console.error('List comments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Authenticated: submit a comment (pending review)
router.post('/', authenticate, async (req, res) => {
  try {
    const { text, rating } = req.body
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required' })
    const err = validateLength('Comment', text, LIMITS.commentText)
    if (err) return res.status(400).json({ error: err })
    const comment = await db.insert('comments', {
      user_id: req.user.id,
      user_name: req.user.name,
      text: text.trim(),
      rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
      status: 'pending',
    })
    await auditCreate(req, 'comment', comment.id, { user_name: req.user.name, text: text.trim().slice(0, 100), rating: comment.rating })
    res.status(201).json(comment)
  } catch (err) {
    console.error('Create comment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: get all comments (any status)
router.get('/all', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { status } = req.query
    let all = await db.findAll('comments')
    if (status) all = all.filter(c => c.status === status)
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json(all)
  } catch (err) {
    console.error('Admin list comments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: approve a comment
router.put('/:id/approve', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const comment = await db.get('comments', parseInt(req.params.id))
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    const updated = await db.update('comments', parseInt(req.params.id), { status: 'approved' })
    await auditUpdate(req, 'comment', comment.id, { status: comment.status }, { status: 'approved' })
    res.json(updated)
  } catch (err) {
    console.error('Approve comment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: reject a comment
router.put('/:id/reject', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const comment = await db.get('comments', parseInt(req.params.id))
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    const updated = await db.update('comments', parseInt(req.params.id), { status: 'rejected' })
    await auditUpdate(req, 'comment', comment.id, { status: comment.status }, { status: 'rejected' })
    res.json(updated)
  } catch (err) {
    console.error('Reject comment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: delete a comment
router.delete('/:id', authenticate, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const comment = await db.get('comments', parseInt(req.params.id))
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    await db.remove('comments', parseInt(req.params.id))
    await auditDelete(req, 'comment', comment.id, { user_name: comment.user_name, text: (comment.text || '').slice(0, 100), rating: comment.rating, status: comment.status })
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete comment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
