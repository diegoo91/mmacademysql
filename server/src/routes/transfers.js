import { Router } from 'express'
import db from '../db.js'
import { requireRole } from '../middleware/rbac.js'
import { auditLog } from '../middleware/audit.js'

const router = Router()

// POST /api/transfers — admin: transfer sessions from one player to another
router.post('/', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { from_player_id, to_player_id, session_type, count, notes } = req.body

    if (!from_player_id || !to_player_id || !session_type || !count || count <= 0) {
      return res.status(400).json({ error: 'from_player_id, to_player_id, session_type, and count (>0) are required' })
    }
    if (from_player_id === to_player_id) {
      return res.status(400).json({ error: 'Cannot transfer to the same player' })
    }
    if (!['private', 'group'].includes(session_type)) {
      return res.status(400).json({ error: 'session_type must be private or group' })
    }

    const fromPlayer = await db.get('users', from_player_id)
    const toPlayer = await db.get('users', to_player_id)
    if (!fromPlayer || !toPlayer) return res.status(404).json({ error: 'Player not found' })

    const fromBalance = fromPlayer.private_balance || 0
    const fromGroup = fromPlayer.group_balance || 0
    const toBalance = toPlayer.private_balance || 0
    const toGroup = toPlayer.group_balance || 0

    // Check sufficient balance
    if (session_type === 'private') {
      if (fromBalance < count) return res.status(400).json({ error: `Insufficient private balance. Has ${fromBalance}, needs ${count}` })
    } else {
      const effectiveFrom = fromGroup + fromBalance * 2
      if (effectiveFrom < count) return res.status(400).json({ error: `Insufficient group balance. Effective ${effectiveFrom}, needs ${count}` })
    }

    // Deduct from sender (conversion-aware)
    let newFromPriv = fromBalance
    let newFromGrp = fromGroup
    let remaining = count

    if (session_type === 'private') {
      newFromPriv = fromBalance - count
    } else {
      // Group: use group first, then convert from private if needed
      if (newFromGrp >= remaining) {
        newFromGrp = newFromGrp - remaining
        remaining = 0
      } else {
        remaining = remaining - newFromGrp
        newFromGrp = 0
        while (remaining > 0 && newFromPriv > 0) {
          newFromPriv--
          newFromGrp += 2
          if (newFromGrp >= remaining) {
            newFromGrp = newFromGrp - remaining
            remaining = 0
          } else {
            remaining = remaining - newFromGrp
            newFromGrp = 0
          }
        }
      }
    }

    // Credit to receiver
    let newToPriv = toBalance
    let newToGrp = toGroup
    if (session_type === 'private') {
      newToPriv = toBalance + count
    } else {
      newToGrp = toGroup + count
    }

    await db.transaction(async (tx) => {
      await tx.update('users', from_player_id, { private_balance: newFromPriv, group_balance: newFromGrp })
      await tx.update('users', to_player_id, { private_balance: newToPriv, group_balance: newToGrp })

      const transfer = await tx.create('session_transfers', {
        from_player_id,
        to_player_id,
        session_type,
        count,
        from_balance_before: fromBalance,
        from_balance_after: newFromPriv,
        to_balance_before: toBalance,
        to_balance_after: newToPriv,
        notes: notes || null,
        created_by: req.user?.id || null,
      })

      await auditLog(req, 'session_transfer', 'session_transfers', transfer.id, null, transfer)
    })

    res.json({
      ok: true,
      transfer: {
        from: { id: from_player_id, name: fromPlayer.name, new_private: newFromPriv, new_group: newFromGrp },
        to: { id: to_player_id, name: toPlayer.name, new_private: newToPriv, new_group: newToGrp },
        session_type,
        count,
      },
    })
  } catch (err) {
    console.error('Transfer error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/transfers — admin: list transfer history
router.get('/', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const all = await db.findAll('session_transfers')
    const users = await db.findAll('users')
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))

    const transfers = all
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map(t => ({
        ...t,
        from_name: userMap[t.from_player_id]?.name || `#${t.from_player_id}`,
        to_name: userMap[t.to_player_id]?.name || `#${t.to_player_id}`,
        created_by_name: userMap[t.created_by]?.name || null,
      }))

    res.json({ transfers })
  } catch (err) {
    console.error('List transfers error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
