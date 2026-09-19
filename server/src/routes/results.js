import { Router } from 'express'
import db from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { auditCreate, auditUpdate, auditDelete } from '../middleware/audit.js'

const router = Router()
router.use(authenticate)

function deriveWinner(scoreA, scoreB) {
  if (scoreA === scoreB) return null
  return scoreA > scoreB ? 'A' : 'B'
}

async function resolveIds(names) {
  if (!Array.isArray(names)) return []
  const ids = []
  for (const name of names) {
    if (!name) { ids.push(null); continue }
    const user = await db.find('users', u => (u.name || '').toLowerCase() === name.toLowerCase())
    ids.push(user ? user.id : null)
  }
  return ids
}

router.get('/', async (req, res) => {
  try {
    const { from, to, player, competition, status, page = 1, limit = 100 } = req.query
    let all = await db.findAll('results')
    if (req.user.role === 'player') {
      all = all.filter(r => r.status === 'confirmed')
    } else if (status) {
      all = all.filter(r => r.status === status)
    }
    if (from) all = all.filter(r => r.date >= from)
    if (to) all = all.filter(r => r.date <= to)
    if (player) {
      const q = player.toLowerCase()
      all = all.filter(r => {
        const sideA = Array.isArray(r.sideA) ? r.sideA : [r.player_a].filter(Boolean)
        const sideB = Array.isArray(r.sideB) ? r.sideB : [r.player_b].filter(Boolean)
        return [...sideA, ...sideB].some(n => n.toLowerCase().includes(q))
      })
    }
    if (competition) all = all.filter(r => r.competition === competition)
    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    const total = all.length
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
    res.json({ results: all.slice(offset, offset + parseInt(limit)), total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('List results error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const result = await db.get('results', parseInt(req.params.id))
    if (!result) return res.status(404).json({ error: 'Result not found' })
    res.json(result)
  } catch (err) {
    console.error('Get result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { date, format, sideA, sideB, sideA_ids, sideB_ids, score_a, score_b, court, competition, notes } = req.body
    if (!date || !format || !sideA || !sideB) {
      return res.status(400).json({ error: 'Date, format, sideA, and sideB are required' })
    }
    if (!['short', 'long', 'tiebreak'].includes(format)) {
      return res.status(400).json({ error: 'Format must be short, long, or tiebreak' })
    }
    if (!Array.isArray(sideA) || sideA.length < 1 || sideA.length > 2) {
      return res.status(400).json({ error: 'sideA must have 1-2 players' })
    }
    if (!Array.isArray(sideB) || sideB.length < 1 || sideB.length > 2) {
      return res.status(400).json({ error: 'sideB must have 1-2 players' })
    }

    // Enforce IDs resolve — reject if any name doesn't match a DB player
    const idsA = await resolveIds(sideA)
    const idsB = await resolveIds(sideB)
    const unresolvedA = sideA.filter((name, i) => name && !idsA[i])
    const unresolvedB = sideB.filter((name, i) => name && !idsB[i])
    if (unresolvedA.length > 0 || unresolvedB.length > 0) {
      return res.status(400).json({
        code: 'UNKNOWN_PLAYER',
        players: [...unresolvedA, ...unresolvedB],
      })
    }

    const sa = Number(score_a) || 0
    const sb = Number(score_b) || 0
    if (sa === sb) return res.status(400).json({ error: 'Scores cannot be tied' })

    const winner_side = deriveWinner(sa, sb)
    const status = (req.user.role === 'superadmin' || req.user.role === 'admin') ? 'confirmed' : 'pending'

    const result = await db.insert('results', {
      date,
      format,
      sideA, sideB,
      sideA_ids: idsA, sideB_ids: idsB,
      player_a: sideA[0] || '',
      player_b: sideB[0] || '',
      score_a: sa, score_b: sb,
      score_text: `${sa}–${sb}`,
      winner_side,
      winner: winner_side === 'A' ? sideA[0] : sideB[0],
      status,
      submitted_by: req.user.id || null,
      court: court || 1,
      competition: competition || '',
      notes: notes || '',
      import_batch: null,
    })
    await auditCreate(req, 'result', result.id, { date, format, sideA, sideB, score_a: sa, score_b: sb, status })
    res.status(201).json(result)
  } catch (err) {
    console.error('Create result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id/confirm', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const result = await db.get('results', id)
    if (!result) return res.status(404).json({ error: 'Result not found' })
    const updated = await db.update('results', id, { status: 'confirmed' })
    await auditUpdate(req, 'result', result.id, { status: result.status }, { status: 'confirmed' })
    res.json(updated)
  } catch (err) {
    console.error('Confirm result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const result = await db.get('results', id)
    if (!result) return res.status(404).json({ error: 'Result not found' })
    const { date, format, sideA, sideB, sideA_ids, sideB_ids, score_a, score_b, court, competition, notes, status } = req.body
    const newSideA = sideA || result.sideA
    const newSideB = sideB || result.sideB

    // Enforce IDs resolve if sides changed
    const idsA = sideA ? await resolveIds(sideA) : (sideA_ids || result.sideA_ids)
    const idsB = sideB ? await resolveIds(sideB) : (sideB_ids || result.sideB_ids)
    if (sideA) {
      const unresolved = sideA.filter((name, i) => name && !idsA[i])
      if (unresolved.length > 0) return res.status(400).json({ code: 'UNKNOWN_PLAYER', players: unresolved })
    }
    if (sideB) {
      const unresolved = sideB.filter((name, i) => name && !idsB[i])
      if (unresolved.length > 0) return res.status(400).json({ code: 'UNKNOWN_PLAYER', players: unresolved })
    }

    const updates = {
      date: date || result.date,
      format: format || result.format,
      sideA: newSideA,
      sideB: newSideB,
      sideA_ids: idsA,
      sideB_ids: idsB,
      player_a: sideA ? sideA[0] : result.player_a,
      player_b: sideB ? sideB[0] : result.player_b,
      score_a: score_a ?? result.score_a,
      score_b: score_b ?? result.score_b,
      score_text: (score_a !== undefined && score_b !== undefined) ? `${score_a}–${score_b}` : result.score_text,
      winner_side: (score_a !== undefined && score_b !== undefined) ? deriveWinner(Number(score_a), Number(score_b)) : result.winner_side,
      winner: (score_a !== undefined && score_b !== undefined) ? (deriveWinner(Number(score_a), Number(score_b)) === 'A' ? (sideA || result.sideA)[0] : (sideB || result.sideB)[0]) : result.winner,
      court: court || result.court,
      competition: competition ?? result.competition,
      notes: notes ?? result.notes,
      status: status || result.status,
    }
    const updated = await db.update('results', id, updates)
    await auditUpdate(req, 'result', result.id, { date: result.date, score_a: result.score_a, score_b: result.score_b, status: result.status }, { date: updates.date, score_a: updates.score_a, score_b: updates.score_b, status: updates.status })
    res.json(updated)
  } catch (err) {
    console.error('Update result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const result = await db.get('results', parseInt(req.params.id))
    if (!result) return res.status(404).json({ error: 'Result not found' })
    await db.remove('results', parseInt(req.params.id))
    await auditDelete(req, 'result', result.id, { date: result.date, sideA: result.sideA, sideB: result.sideB, score_a: result.score_a, score_b: result.score_b })
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
