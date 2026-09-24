import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

router.get('/', async (req, res) => {
  try {
    const totalUsers = await db.count('users')
    const totalPlayers = await db.count('users', u => u.role === 'player')
    const totalResults = await db.count('results')
    const totalBookings = await db.count('bookings')
    const activeBookings = await db.count('bookings', b => b.status === 'player_confirmed' || b.status === 'payment_approved' || b.status === 'schedule_approved' || b.status === 'payment_pending')
    const totalRevenue = await db.sum('payments', 'amount', p => p.status === 'payment_approved')
    const totalSlots = await db.count('slots')
    const occupiedSlots = await db.count('slots', s => s.status === 'player_confirmed' || s.status === 'schedule_approved')
    const recentBookings = await Promise.all((await db.findAll('bookings')).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(async (b) => {
      const u = b.user_id ? await db.get('users', b.user_id) : null
      return { ...b, user_name: u ? u.name : null }
    }))
    const recentImports = await Promise.all((await db.findAll('import_batches')).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(async (ib) => {
      const u = ib.by_user ? await db.get('users', ib.by_user) : null
      return { ...ib, user_name: u ? u.name : null }
    }))
    const usersByRole = await Promise.all(['superadmin', 'admin', 'coach', 'player'].map(async (role) => ({ role, count: await db.count('users', u => u.role === role) })))

    const { effectivePrivate, effectiveGroupBalance, ensureCycleFresh } = await import('../utils/balance.js')
    const allUsers = await db.findAll('users')
    const sessionCredits = []
    for (const u of allUsers) {
      const fresh = await ensureCycleFresh(u, { notify: false })
      const usr = fresh || u
      const priv = effectivePrivate(usr)
      const grp = effectiveGroupBalance(usr)
      if (priv > 0 || grp > 0) {
        sessionCredits.push({
          name: usr.name,
          private_balance: priv,
          group_balance: grp,
          cycle_private: usr.cycle_private || 0,
          cycle_group: usr.cycle_group || 0,
          cycle_expires_at: usr.cycle_expires_at || null,
        })
      }
    }

    const upcomingSlots = (await db.findAll('slots'))
      .filter(s => s.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.court - b.court)
      .slice(0, 20)
      .map(s => ({
        id: s.id, date: s.date, time: s.time, court: s.court,
        player_text: s.player_text || '', session_type: s.session_type || '',
      }))

    const slotsByDate = {}
    for (const s of await db.findAll('slots')) {
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
