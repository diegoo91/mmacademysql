import { Router } from 'express'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

router.get('/', (req, res) => {
  try {
    const totalUsers = db.count('users')
    const totalPlayers = db.count('users', u => u.role === 'player')
    const totalResults = db.count('results')
    const totalBookings = db.count('bookings')
    const activeBookings = db.count('bookings', b => b.status === 'player_confirmed' || b.status === 'payment_approved' || b.status === 'schedule_approved' || b.status === 'payment_pending')
    const totalRevenue = db.sum('payments', 'amount', p => p.status === 'payment_approved')
    const totalSlots = db.count('slots')
    const occupiedSlots = db.count('slots', s => s.status === 'player_confirmed' || s.status === 'schedule_approved')
    const recentBookings = db.findAll('bookings').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(b => {
      const u = b.user_id ? db.get('users', b.user_id) : null
      return { ...b, user_name: u ? u.name : null }
    })
    const recentImports = db.findAll('import_batches').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(ib => {
      const u = ib.by_user ? db.get('users', ib.by_user) : null
      return { ...ib, user_name: u ? u.name : null }
    })
    const usersByRole = ['superadmin', 'admin', 'coach', 'player'].map(role => ({ role, count: db.count('users', u => u.role === role) }))

    const sessionCredits = db.findAll('users', u => (u.private_balance || 0) > 0 || (u.group_balance || 0) > 0).map(u => ({
      user_id: u.id, name: u.name,
      private_balance: u.private_balance || 0,
      group_balance: u.group_balance || 0,
    }))

    const upcomingSlots = db.findAll('slots')
      .filter(s => s.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.court - b.court)
      .slice(0, 20)
      .map(s => ({
        id: s.id, date: s.date, time: s.time, court: s.court,
        player_text: s.player_text || '', session_type: s.session_type || '',
      }))

    const slotsByDate = {}
    for (const s of db.findAll('slots')) {
      if (!slotsByDate[s.date]) slotsByDate[s.date] = { total: 0, occupied: 0 }
      slotsByDate[s.date].total++
      if (s.player_text && s.player_text.trim()) slotsByDate[s.date].occupied++
    }

    res.json({
      stats: {
        totalUsers, totalPlayers, totalResults, totalBookings, activeBookings, totalRevenue,
        totalSlots, occupiedSlots,
        occupancyRate: totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0,
      },
      recentBookings, recentImports, usersByRole, sessionCredits,
      upcomingSlots, slotsByDate,
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
