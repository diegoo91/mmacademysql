import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const CATEGORIES = ['Court Booking Fees', 'Equipment', 'Salaries', 'Utilities', 'Other']
const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

router.get('/', (req, res) => {
  try {
    const { from, to, category, page = 1, limit = 50 } = req.query
    let all = db.findAll('expenses')
    if (from) all = all.filter(e => e.date >= from)
    if (to) all = all.filter(e => e.date <= to)
    if (category) all = all.filter(e => e.category === category)
    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    const total = all.length
    const totalAmount = all.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
    const expenses = all.slice(offset, offset + parseInt(limit))
    res.json({ expenses, total, totalAmount, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('List expenses error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', (req, res) => {
  try {
    const { date, category, description, amount } = req.body
    if (!date || !category || !description || amount === undefined) {
      return res.status(400).json({ error: 'Date, category, description, and amount are required' })
    }
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: `Invalid category. Must be: ${CATEGORIES.join(', ')}` })
    const amt = Number(amount)
    if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'Amount must be a non-negative number' })
    const expense = db.insert('expenses', {
      date, category, description, amount: amt, created_by: req.user.id,
    })
    res.status(201).json(expense)
  } catch (err) {
    console.error('Create expense error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const existing = db.get('expenses', id)
    if (!existing) return res.status(404).json({ error: 'Expense not found' })
    const { date, category, description, amount } = req.body
    if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: `Invalid category. Must be: ${CATEGORIES.join(', ')}` })
    if (amount !== undefined) {
      const amt = Number(amount)
      if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'Amount must be a non-negative number' })
    }
    const updated = db.update('expenses', id, {
      date: date || existing.date,
      category: category || existing.category,
      description: description ?? existing.description,
      amount: amount !== undefined ? Number(amount) : existing.amount,
    })
    res.json(updated)
  } catch (err) {
    console.error('Update expense error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', (req, res) => {
  try {
    if (!db.get('expenses', parseInt(req.params.id))) return res.status(404).json({ error: 'Expense not found' })
    db.remove('expenses', parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete expense error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
