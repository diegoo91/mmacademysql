export const BRACKET_SIZES = [4, 8, 16, 32, 64]
export const SKILL_LEVELS = ['Beginners', 'Low D', 'D', 'Low C', 'C', 'B', 'A', 'Open']
export const FORMATS = ['knockout', 'groups_knockout']
export const MATCH_FORMATS = ['short', 'long', 'tiebreak']
export const TOURNAMENT_STATUSES = ['draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled']

// DB timestamp columns come back as naive 'YYYY-MM-DD HH:MM:SS' strings whose
// wall time is UTC (routes write ISO-8601 Z strings; pg drops the offset).
// `new Date()` on a naive string would misread it as LOCAL time — always use
// this helper when comparing stored tournament timestamps to now.
export function parseDbTs(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return v
  const s = String(v).trim()
  if (!s) return null
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s)
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(hasZone ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function nextBracketSize(n) {
  for (const s of BRACKET_SIZES) if (n <= s) return s
  return null
}

export function standardSeeding(size) {
  if (!BRACKET_SIZES.includes(size)) return null
  let seeds = [1]
  while (seeds.length < size) {
    const m = seeds.length * 2 + 1
    const next = []
    for (const s of seeds) {
      next.push(s, m - s)
    }
    seeds = next
  }
  return seeds
}

export function validateTournamentInput(input) {
  const name = String(input.name || '').trim()
  if (!name) return { ok: false, error: 'name is required' }
  if (name.length > 160) return { ok: false, error: 'name too long (max 160)' }
  if (!SKILL_LEVELS.includes(input.skill_level)) {
    return { ok: false, error: `skill_level must be one of: ${SKILL_LEVELS.join(', ')}` }
  }
  if (!FORMATS.includes(input.format)) return { ok: false, error: 'format must be knockout or groups_knockout' }
  if (!MATCH_FORMATS.includes(input.match_format)) return { ok: false, error: 'match_format must be short, long, or tiebreak' }
  const fee = Number(input.entry_fee ?? 0)
  if (!Number.isFinite(fee) || fee < 0) return { ok: false, error: 'entry_fee must be >= 0' }
  const openAt = input.registration_open_at || null
  const closeAt = input.registration_close_at || null
  if (openAt && closeAt && new Date(openAt) >= new Date(closeAt)) {
    return { ok: false, error: 'registration_close_at must be after registration_open_at' }
  }
  if (input.format === 'knockout') {
    const size = Number(input.bracket_size)
    if (!BRACKET_SIZES.includes(size)) {
      return { ok: false, error: `bracket_size must be one of: ${BRACKET_SIZES.join(', ')}` }
    }
    return { ok: true, name }
  }
  const g = Number(input.groups_count)
  const tpg = Number(input.teams_per_group)
  const adv = Number(input.advance_per_group)
  if (!Number.isInteger(g) || g < 2) return { ok: false, error: 'groups_count must be an integer >= 2' }
  if (!Number.isInteger(tpg) || tpg < 2) return { ok: false, error: 'teams_per_group must be an integer >= 2' }
  if (!Number.isInteger(adv) || adv < 1 || adv > tpg) {
    return { ok: false, error: 'advance_per_group must be between 1 and teams_per_group' }
  }
  if (!BRACKET_SIZES.includes(g * tpg)) {
    return { ok: false, error: `groups_count x teams_per_group must be one of: ${BRACKET_SIZES.join(', ')}` }
  }
  if (!BRACKET_SIZES.includes(g * adv)) {
    return { ok: false, error: `groups_count x advance_per_group must be one of: ${BRACKET_SIZES.join(', ')}` }
  }
  return { ok: true, name }
}

export function signupCap(t) {
  if (t.format === 'knockout') return Number(t.bracket_size)
  return Number(t.groups_count) * Number(t.teams_per_group)
}

export function knockoutSizeFor(t) {
  if (t.format === 'knockout') return Number(t.bracket_size)
  return Number(t.groups_count) * Number(t.advance_per_group)
}

export function nextSlotOf(round, slot) {
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'a' : 'b' }
}

export function buildKnockoutRows({ teamIds, bracketSize }) {
  const seeding = standardSeeding(bracketSize)
  if (!seeding) return { ok: false, error: 'invalid bracket size' }
  if (!Array.isArray(teamIds) || teamIds.length < 2) return { ok: false, error: 'need at least 2 teams' }
  if (teamIds.length > bracketSize) return { ok: false, error: `only ${bracketSize} slots for ${teamIds.length} teams` }
  const slots = new Array(bracketSize).fill(null)
  teamIds.forEach((tid, i) => {
    slots[seeding.indexOf(i + 1)] = tid
  })
  const rows = []
  const roundCounts = []
  let count = bracketSize / 2
  while (count >= 1) {
    roundCounts.push(count)
    count = Math.floor(count / 2)
  }
  roundCounts.forEach((roundMatchCount, ri) => {
    const round = ri + 1
    for (let slot = 0; slot < roundMatchCount; slot++) {
      const isR1 = round === 1
      const next = round < roundCounts.length ? nextSlotOf(round, slot) : null
      rows.push({
        phase: 'knockout',
        round_no: round,
        slot_index: slot,
        team_a_id: isR1 ? slots[slot * 2] : null,
        team_b_id: isR1 ? slots[slot * 2 + 1] : null,
        next_round: next ? next.round : null,
        next_slot: next ? next.slot : null,
        next_side: next ? next.side : null,
        status: 'scheduled',
        winner_team_id: null,
        score_a: null,
        score_b: null,
      })
    }
  })
  return { ok: true, rows, slots }
}

function rotate(arr) {
  return [arr[0], arr[arr.length - 1], ...arr.slice(1, arr.length - 1)]
}

export function roundRobinPairings(teamIds) {
  const ids = [...teamIds]
  if (ids.length % 2 !== 0) ids.push(null)
  const n = ids.length
  const half = n / 2
  const rounds = n - 1
  const out = []
  let arr = [...ids]
  for (let r = 0; r < rounds; r++) {
    const pairs = []
    for (let i = 0; i < half; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a !== null && b !== null) pairs.push([a, b])
    }
    out.push(pairs)
    arr = rotate(arr)
  }
  return out
}

export function buildGroupRows({ groups }) {
  const rows = []
  for (const g of groups) {
    const rounds = roundRobinPairings(g.teamIds)
    let idx = 0
    for (const round of rounds) {
      for (const [a, b] of round) {
        rows.push({
          phase: 'group',
          group_label: g.label,
          round_no: 1,
          slot_index: idx,
          team_a_id: a,
          team_b_id: b,
          next_round: null,
          next_slot: null,
          next_side: null,
          status: 'scheduled',
          winner_team_id: null,
          score_a: null,
          score_b: null,
        })
        idx += 1
      }
    }
  }
  return rows
}

export function evaluateKnockout(rows) {
  // state keys must be phase-scoped: group rows also use round_no=1 /
  // slot_index=0..n and would otherwise collide with knockout round 1
  const phaseOf = (r) => r.phase || 'knockout'
  const feeders = new Map()
  for (const r of rows) {
    if (r.next_round != null) {
      feeders.set(`${phaseOf(r)}:${r.next_round}:${r.next_slot}:${r.next_side}`, r)
    }
  }
  const stateOf = new Map()
  const resolve = (row) => {
    const phase = phaseOf(row)
    const key = `${phase}:${row.round_no}:${row.slot_index}`
    if (stateOf.has(key)) return stateOf.get(key)
    let a
    let b
    if (row.round_no === 1) {
      a = row.team_a_id ?? null
      b = row.team_b_id ?? null
    } else {
      const sa = feeders.has(`${phase}:${row.round_no}:${row.slot_index}:a`)
        ? resolve(feeders.get(`${phase}:${row.round_no}:${row.slot_index}:a`))
        : { resolved: false }
      const sb = feeders.has(`${phase}:${row.round_no}:${row.slot_index}:b`)
        ? resolve(feeders.get(`${phase}:${row.round_no}:${row.slot_index}:b`))
        : { resolved: false }
      if (!sa.resolved || !sb.resolved) {
        const partial = {
          resolved: false,
          waiting: true,
          a: sa.resolved ? sa.winner : null,
          b: sb.resolved ? sb.winner : null,
        }
        stateOf.set(key, partial)
        return partial
      }
      a = sa.winner ?? null
      b = sb.winner ?? null
    }
    let status
    let winner = null
    let playable = false
    let resolved = true
    if (a && b) {
      const done = row.status === 'completed'
      if (done) {
        status = 'completed'
        winner = row.winner_team_id ?? (row.score_a > row.score_b ? row.team_a_id : row.team_b_id)
      } else {
        status = 'scheduled'
        playable = true
        resolved = false
      }
    } else if (a && !b) {
      status = 'bye'
      winner = a
    } else if (!a && b) {
      status = 'bye'
      winner = b
    } else {
      status = 'tbd'
      winner = null
    }
    const st = { resolved, waiting: false, a, b, status, winner, playable }
    stateOf.set(key, st)
    return st
  }
  return rows.map((row) => {
    const st = resolve(row)
    return {
      ...row,
      a: st.a ?? null,
      b: st.b ?? null,
      status: st.waiting ? 'tbd' : st.status,
      winner: st.waiting ? null : st.winner,
      playable: st.playable || false,
    }
  })
}

function strengthCompareRows(a, b) {
  if (b.points !== a.points) return b.points - a.points
  if (b.games_diff !== a.games_diff) return b.games_diff - a.games_diff
  if (b.games_won !== a.games_won) return b.games_won - a.games_won
  return 0
}

function compareStrength(a, b) {
  if (b.points !== a.points) return b.points - a.points
  if (b.games_diff !== a.games_diff) return b.games_diff - a.games_diff
  if (b.games_won !== a.games_won) return b.games_won - a.games_won
  return 0
}

export function computeStandings(teams, matches) {
  const groups = new Map()
  for (const t of teams) {
    const label = t.group_label || '-'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(t)
  }
  const out = {}
  for (const [label, groupTeams] of groups) {
    const rowsByTeam = new Map()
    for (const t of groupTeams) {
      rowsByTeam.set(t.id, {
        team_id: t.id,
        team_name: t.team_name,
        player1_id: t.player1_id,
        player2_id: t.player2_id,
        seed: t.seed ?? null,
        played: 0,
        won: 0,
        lost: 0,
        points: 0,
        games_won: 0,
        games_lost: 0,
        games_diff: 0,
        mini_wins: 0,
      })
    }
    const groupMatches = matches.filter(
      (m) => m.phase === 'group' && (m.group_label || '-') === label && m.status === 'completed' && m.winner_team_id,
    )
    for (const m of groupMatches) {
      const ra = rowsByTeam.get(m.team_a_id)
      const rb = rowsByTeam.get(m.team_b_id)
      if (!ra || !rb) continue
      const aWon = m.winner_team_id === m.team_a_id
      const winner = aWon ? ra : rb
      const loser = aWon ? rb : ra
      winner.played += 1
      loser.played += 1
      winner.won += 1
      loser.lost += 1
      winner.points += 1
      const wg = aWon ? m.score_a : m.score_b
      const lg = aWon ? m.score_b : m.score_a
      winner.games_won += wg
      winner.games_lost += lg
      loser.games_won += lg
      loser.games_lost += wg
    }
    const rows = [...rowsByTeam.values()]
    for (const r of rows) r.games_diff = r.games_won - r.games_lost

    const buckets = new Map()
    for (const r of rows) {
      const k = String(r.won)
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(r)
    }
    const bucketKeys = [...buckets.keys()].sort((x, y) => Number(y) - Number(x)
    )
    const ordered = []
    for (const bk of bucketKeys) {
      const bucket = buckets.get(bk)
      if (bucket.length === 1) {
        ordered.push(bucket[0])
        continue
      }
      const subsetIds = bucket.map((r) => r.team_id)
      const mini = new Map(subsetIds.map((id) => [id, 0]))
      for (const m of groupMatches) {
        if (!subsetIds.includes(m.team_a_id) || !subsetIds.includes(m.team_b_id)) continue
        if (m.status !== 'completed' || !m.winner_team_id) continue
        mini.set(m.winner_team_id, (mini.get(m.winner_team_id) || 0) + 1)
      }
      for (const r of bucket) r.mini_wins = mini.get(r.team_id) || 0
      bucket.sort((x, y) => {
        if (y.mini_wins !== x.mini_wins) return y.mini_wins - x.mini_wins
        return compareStrength(x, y)
      })
      ordered.push(...bucket)
    }
    out[label] = ordered.map((r, i) => ({ ...r, position: i + 1, mini_wins: undefined }))
  }
  return out
}

export function avoidSameGroupR1(seedTeams, bracketSize, groupCount) {
  if (groupCount <= 1) return { ok: true, arr: [...seedTeams] }
  const seeding = standardSeeding(bracketSize)
  if (!seeding) return { ok: false, error: 'invalid bracket size' }
  const arr = [...seedTeams]
  const n = arr.length
  const groupAt = (seedNo) => arr[seedNo - 1]?.group_label ?? null
  const blocks = bracketSize / groupCount
  if (blocks % 2 !== 0) return { ok: true, arr }
  const r1Pairs = []
  for (let pos = 0; pos < bracketSize; pos += 2) {
    r1Pairs.push([seeding[pos], seeding[pos + 1]])
  }
  const blockOf = (seedNo) => Math.floor((seedNo - 1) / groupCount)
  const handled = new Set()
  for (const [s1, s2] of r1Pairs) {
    const b1 = blockOf(s1)
    const b2 = blockOf(s2)
    if (b1 === b2) continue
    const lo = Math.min(b1, b2)
    const hi = Math.max(b1, b2)
    const key = `${lo}-${hi}`
    if (handled.has(key)) continue
    handled.add(key)
    const pairsCross = r1Pairs.filter(
      ([x, y]) => (blockOf(x) === lo && blockOf(y) === hi) || (blockOf(x) === hi && blockOf(y) === lo),
    )
    const slots = []
    const slotGroup = []
    for (const [x, y] of pairsCross) {
      const hiSeed = blockOf(x) === hi ? x : y
      const loSeed = blockOf(x) === hi ? y : x
      if (hiSeed > n) continue
      slots.push(hiSeed)
      slotGroup.push(groupAt(loSeed))
    }
    if (!slots.length) continue
    const candidates = []
    const candGroup = []
    for (let s = hi * groupCount + 1; s <= (hi + 1) * groupCount; s++) {
      if (s > n) continue
      candidates.push(s)
      candGroup.push(groupAt(s))
    }
    if (candidates.length !== slots.length) continue
    const slotAssign = new Array(slots.length).fill(-1)
    const canPlace = (ti, seen) => {
      for (let si = 0; si < slots.length; si++) {
        if (candGroup[ti] === slotGroup[si]) continue
        if (seen.has(si)) continue
        seen.add(si)
        if (slotAssign[si] === -1 || canPlace(slotAssign[si], seen)) {
          slotAssign[si] = ti
          return true
        }
      }
      return false
    }
    for (let ti = 0; ti < candidates.length; ti++) {
      if (!canPlace(ti, new Set())) {
        return { ok: false, error: 'could not avoid a same-group first-round pairing' }
      }
    }
    const moved = slots.map((slotSeed, si) => ({ slotSeed, team: arr[candidates[slotAssign[si]] - 1] }))
    for (const m of moved) arr[m.slotSeed - 1] = m.team
  }
  for (const [s1, s2] of r1Pairs) {
    const g1 = groupAt(s1)
    const g2 = groupAt(s2)
    if (g1 != null && g1 === g2) {
      return { ok: false, error: 'could not avoid a same-group first-round pairing' }
    }
  }
  return { ok: true, arr }
}

export function seedQualifierKnockout({ standings, advancePerGroup, bracketSize }) {
  const labels = Object.keys(standings).sort()
  const maxRank = Math.max(...labels.map((l) => standings[l].length), 1)
  const ranks = Math.min(advancePerGroup, maxRank)
  const blocks = []
  for (let r = 0; r < ranks; r++) {
    const block = []
    for (const l of labels) {
      const row = standings[l][r]
      if (row) block.push({ ...row, group_label: l, rank_in_group: r + 1 })
    }
    block.sort(strengthCompareRows)
    blocks.push(block)
  }
  const ordered = []
  for (const block of blocks) ordered.push(...block)
  if (ordered.length > bracketSize) {
    return { ok: false, error: `${ordered.length} qualifiers exceed bracket size ${bracketSize}` }
  }
  const seedTeams = ordered.map((row) => ({
    id: row.team_id,
    team_name: row.team_name,
    group_label: row.group_label,
    rank_in_group: row.rank_in_group,
  }))
  const fix = avoidSameGroupR1(seedTeams, bracketSize, labels.length)
  if (!fix.ok) return fix
  return { ok: true, seedTeams: fix.arr }
}

export function autoDistributeIntoGroups(teamIds, groupCount) {
  const labels = []
  for (let i = 0; i < groupCount; i++) labels.push(String.fromCharCode(65 + i))
  const out = Object.fromEntries(labels.map((l) => [l, []]))
  teamIds.forEach((tid, i) => {
    out[labels[i % groupCount]].push(tid)
  })
  return out
}
