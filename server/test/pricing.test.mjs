/**
 * Pure unit tests for package pricing (no DB, no network).
 *
 * Guards the two historical bug classes:
 *   1. wrong/flat session pricing in the unpaid report → every tier value and
 *      every greedy split is asserted against fixed numbers, plus a parity test
 *      against the public frontend table (src/data/pricingData.js).
 *   2. payment amount covering more than it should → bestCoverage is brute
 *      force checked: it must never exceed the amount and must always match an
 *      exhaustive search over (private, group) pairs.
 *
 * Run: npm test   (in server/)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  PRICING,
  STAFF_PRICING,
  calculatePrice,
  packagePrice,
  bestCoverage,
  sessionsForAmount,
  nearestPackPool,
} from '../src/utils/pricing.js'
import {
  PRICING as FRONT_PRICING,
  STAFF_PRICING as FRONT_STAFF_PRICING,
  calculatePrice as frontPrice,
} from '../../src/data/pricingData.js'

describe('calculatePrice — tier values', () => {
  it('private tiers', () => {
    assert.equal(calculatePrice('private', 1), 1000)
    assert.equal(calculatePrice('private', 4), 3600)
    assert.equal(calculatePrice('private', 8), 7200)
    assert.equal(calculatePrice('private', 12), 10800)
    assert.equal(calculatePrice('private', 16), 14400)
  })

  it('group tiers', () => {
    assert.equal(calculatePrice('group', 1), 500)
    assert.equal(calculatePrice('group', 4), 1800)
    assert.equal(calculatePrice('group', 8), 3600)
    assert.equal(calculatePrice('group', 12), 5400)
    assert.equal(calculatePrice('group', 16), 7200)
  })

  it('unknown type costs 0', () => {
    assert.equal(calculatePrice('vip', 10), 0)
  })

  it('zero / invalid counts cost 0', () => {
    assert.equal(calculatePrice('private', 0), 0)
    assert.equal(calculatePrice('private', 'nonsense'), 0)
    assert.equal(packagePrice(0, 0), 0)
  })
})

describe('calculatePrice — greedy splits', () => {
  it('private splits (largest bundle first, singles at 1,000)', () => {
    assert.equal(calculatePrice('private', 5), 4600) // 4 + 1
    assert.equal(calculatePrice('private', 9), 8200) // 8 + 1
    assert.equal(calculatePrice('private', 10), 9200) // 8 + 2 singles
    assert.equal(calculatePrice('private', 15), 13800) // 12 + 3 singles
    assert.equal(calculatePrice('private', 17), 15400) // 16 + 1
    assert.equal(calculatePrice('private', 20), 18000) // 16 + 4
  })

  it('group splits (singles at 500)', () => {
    assert.equal(calculatePrice('group', 3), 3 * 500)
    assert.equal(calculatePrice('group', 9), 3600 + 500) // 8 + 1
    assert.equal(calculatePrice('group', 13), 5400 + 500) // 12 + 1
    assert.equal(calculatePrice('group', 20), 7200 + 1800) // 16 + 4
    assert.equal(calculatePrice('group', 24), 7200 + 3600) // 16 + 8
  })

  it('the regression cases: 9 private = 8,200 and 16P + 3G = 15,900', () => {
    assert.equal(calculatePrice('private', 9), 8200)
    assert.equal(packagePrice(16, 3), 15900)
    assert.equal(packagePrice(15, 3), 15300) // Hassan: 15P (12+3) + 3G
    assert.equal(packagePrice(18, 0), 16400) // 16 + 2 singles
  })
})

describe('packagePrice', () => {
  it('adds both types', () => {
    assert.equal(packagePrice(8, 4), 9000)
    assert.equal(packagePrice(1, 1), 1500)
    assert.equal(packagePrice(16, 16), 21600)
  })
})

describe('bestCoverage — fixed cases', () => {
  it('7,000 against 9 unpaid private covers 7 (the partial-payment case)', () => {
    // 7P = 4-pack + 3 singles = 6,600 — the 8-pack (7,200) no longer fits
    assert.deepEqual(bestCoverage(7000, 9, 0), { private: 7, group: 0, value: 6600 })
    // exact 8-pack cash covers exactly 8
    assert.deepEqual(bestCoverage(7200, 9, 0), { private: 8, group: 0, value: 7200 })
  })

  it('paying the full owed covers everything, no credit', () => {
    assert.deepEqual(bestCoverage(15900, 16, 3), { private: 16, group: 3, value: 15900 })
    // 9 unpaid private cost exactly 8,200 (8-pack + single) → all 9 covered
    assert.deepEqual(bestCoverage(8200, 9, 0), { private: 9, group: 0, value: 8200 })
  })

  it('an amount below the cheapest session covers nothing', () => {
    assert.deepEqual(bestCoverage(400, 9, 0), { private: 0, group: 0, value: 0 })
    assert.deepEqual(bestCoverage(0, 9, 9), { private: 0, group: 0, value: 0 })
    assert.deepEqual(bestCoverage(-500, 9, 9), { private: 0, group: 0, value: 0 })
  })

  it('is capped by what is unpaid (overpay never over-covers)', () => {
    assert.deepEqual(bestCoverage(999999, 16, 3), { private: 16, group: 3, value: 15900 })
    assert.deepEqual(bestCoverage(5000, 2, 0), { private: 2, group: 0, value: 2000 })
  })

  it('breaks value ties toward more private sessions', () => {
    // 1,000 buys 1 private or 2 group → private wins
    assert.deepEqual(bestCoverage(1000, 1, 4), { private: 1, group: 0, value: 1000 })
    // 0 private available → 2 group
    assert.deepEqual(bestCoverage(1000, 0, 4), { private: 0, group: 2, value: 1000 })
  })

  it('mixed bundle mix maximises spend without exceeding the amount', () => {
    // 1,500 = 1 private (1,000) + 1 group (500)
    assert.deepEqual(bestCoverage(1500, 9, 9), { private: 1, group: 1, value: 1500 })
    // 3,600 → group 16-pack costs 7,200, too much: best is 4 private (3,600)
    assert.deepEqual(bestCoverage(3600, 9, 9), { private: 4, group: 0, value: 3600 })
    // 8,500 → best under the cap is 7P+4G (6,600+1,800 = 8,400)
    assert.deepEqual(bestCoverage(8500, 20, 9), { private: 7, group: 4, value: 8400 })
  })
})

describe('bestCoverage — brute-force cross-check', () => {
  const amounts = [0, 500, 999, 1000, 1500, 1800, 3500, 3600, 7000, 7200, 7999, 8000, 10800, 14000, 14400, 15500, 15900, 15999]
  const maxPrivates = [0, 1, 4, 9, 16]
  const maxGroups = [0, 3, 8]

  /** Exhaustive search with the same tie rules: max value ≤ amount,
   *  then more private, then more sessions total. */
  function brute(amount, maxP, maxG) {
    let best = { private: 0, group: 0, value: 0 }
    for (let p = 0; p <= maxP; p++) {
      for (let g = 0; g <= maxG; g++) {
        const value = calculatePrice('private', p) + calculatePrice('group', g)
        if (value > amount) continue
        if (
          value > best.value ||
          (value === best.value && p > best.private) ||
          (value === best.value && p === best.private && p + g > best.private + best.group)
        ) {
          best = { private: p, group: g, value }
        }
      }
    }
    return best
  }

  it('always equals exhaustive search and never exceeds the amount', () => {
    let checked = 0
    for (const amount of amounts) {
      for (const maxP of maxPrivates) {
        for (const maxG of maxGroups) {
          const got = bestCoverage(amount, maxP, maxG)
          assert.deepEqual(got, brute(amount, maxP, maxG), `bestCoverage(${amount}, ${maxP}, ${maxG})`)
          assert.ok(got.value <= amount, `coverage ${got.value} exceeds amount ${amount}`)
          assert.ok(got.private <= maxP && got.group <= maxG, 'covers more than unpaid')
          assert.equal(got.value, calculatePrice('private', got.private) + calculatePrice('group', got.group))
          checked++
        }
      }
    }
    assert.ok(checked > 200, `expected a broad sweep, checked ${checked}`)
  })
})

describe('sessionsForAmount — leftover credit', () => {
  it('spends the leftover on the best session mix', () => {
    // 7,000 → 5P+5G = 6,900 (best fit; a 3P+9G mix would cost 7,100)
    assert.deepEqual(sessionsForAmount(7000), { private: 5, group: 5, value: 6900 })
    assert.deepEqual(sessionsForAmount(1000), { private: 1, group: 0, value: 1000 })
    assert.deepEqual(sessionsForAmount(1500), { private: 1, group: 1, value: 1500 })
    assert.deepEqual(sessionsForAmount(400), { private: 0, group: 0, value: 0 })
    assert.deepEqual(sessionsForAmount(0), { private: 0, group: 0, value: 0 })
  })

  // Regression: the search cap used to assume no session costs less than the
  // SINGLE rate, so bulk packages were unreachable — exact tier amounts must
  // buy the tier.
  it('exact tier amounts buy the tier (bulk rates reachable)', () => {
    assert.deepEqual(sessionsForAmount(3600), { private: 4, group: 0, value: 3600 })
    assert.deepEqual(sessionsForAmount(7200), { private: 8, group: 0, value: 7200 })
    assert.deepEqual(sessionsForAmount(10800), { private: 12, group: 0, value: 10800 })
    assert.deepEqual(sessionsForAmount(14400), { private: 16, group: 0, value: 14400 })
    assert.deepEqual(sessionsForAmount(16000), { private: 17, group: 1, value: 15900 })
  })

  it('equals exhaustive search for every amount tested (cap is always sufficient)', () => {
    /** Same tie rules as bestCoverage: max value, then more private, then more sessions. */
    function brute(amount) {
      let best = { private: 0, group: 0, value: 0 }
      for (let p = 0; p <= 60; p++) {
        for (let g = 0; g <= 60; g++) {
          const value = calculatePrice('private', p) + calculatePrice('group', g)
          if (value > amount) continue
          if (
            value > best.value ||
            (value === best.value && p > best.private) ||
            (value === best.value && p === best.private && p + g > best.private + best.group)
          ) best = { private: p, group: g, value }
        }
      }
      return best
    }
    for (const amount of [500, 1000, 1500, 1800, 3500, 3600, 7000, 7200, 8000, 10800, 14000, 14400, 15500, 16000, 20000, 25000]) {
      const got = sessionsForAmount(amount)
      assert.deepEqual(got, brute(amount), `sessionsForAmount(${amount})`)
      assert.ok(got.value <= amount, `sessionsForAmount(${amount}) value ${got.value} > amount`)
    }
  })

  it('never spends more than the amount', () => {
    for (const amount of [1, 999, 1001, 3500, 6999, 13999, 14399, 25000]) {
      const got = sessionsForAmount(amount)
      assert.ok(got.value <= amount, `sessionsForAmount(${amount}) value ${got.value} > amount`)
    }
  })
})

describe('nearestPackPool — Best-Package Rule', () => {
  it('approved pack table (cash vs debt)', () => {
    // Farida: 15,500 against an 17,900 debt → base pack (16,4)=16,200;
    // 15% upward cap (15,500×1.15 = 17,825) rejects the 16P+8G pack (18,000)
    const farida = nearestPackPool(15500, 17900)
    assert.deepEqual(farida, { private: 16, group: 4, value: 16200 })
    assert.equal(15500 - farida.value, -700)
    assert.deepEqual(nearestPackPool(7000), { private: 8, group: 0, value: 7200 })
    assert.deepEqual(nearestPackPool(7200), { private: 8, group: 0, value: 7200 })
    assert.deepEqual(nearestPackPool(5000), { private: 4, group: 4, value: 5400 })
    assert.deepEqual(nearestPackPool(2500), { private: 0, group: 4, value: 1800 })
    assert.deepEqual(nearestPackPool(3500), { private: 4, group: 0, value: 3600 })
    assert.deepEqual(nearestPackPool(3600), { private: 4, group: 0, value: 3600 })
    assert.deepEqual(nearestPackPool(10800), { private: 12, group: 0, value: 10800 })
    assert.deepEqual(nearestPackPool(14400), { private: 16, group: 0, value: 14400 })
  })

  it('15% upward cap: packs too far above the cash are rejected', () => {
    // 3,000: the (4,0)=3,600 pack is +20% → rejected → best in-budget (0,4)
    assert.deepEqual(nearestPackPool(3000), { private: 0, group: 4, value: 1800 })
    // 5,000: (4,4)=5,400 is +8% → allowed and nearest
    assert.deepEqual(nearestPackPool(5000), { private: 4, group: 4, value: 5400 })
    // 2,500: (4,0)=3,600 is +44% → rejected → round-down (0,4), +700 prepaid
    const p2500 = nearestPackPool(2500)
    assert.deepEqual(p2500, { private: 0, group: 4, value: 1800 })
    assert.equal(2500 - p2500.value, 700)
  })

  it('debt pulls the target up only within the cap', () => {
    // partial 15,000 against a 17,500 debt: base nearest is (16,0)=14,400;
    // debt pull toward 17,500 caps the pack at 15,000×1.15 = 17,250, so
    // (16,8)=18,000 is rejected → best in-budget pack (16,4)=16,200
    assert.deepEqual(nearestPackPool(15000, 17500), { private: 16, group: 4, value: 16200 })
    // exact cash pack is never overridden: 14,400 = (16,0) exactly
    assert.deepEqual(nearestPackPool(14400, 17900), { private: 16, group: 0, value: 14400 })
  })

  it('zero / negative inputs', () => {
    assert.deepEqual(nearestPackPool(0), { private: 0, group: 0, value: 0 })
    assert.deepEqual(nearestPackPool(-100), { private: 0, group: 0, value: 0 })
    assert.deepEqual(nearestPackPool(0, 5000), { private: 0, group: 0, value: 0 })
  })

  it('peels (16,16) packs above the catalog', () => {
    // 50,000: 2 × (16,16)=43,200 peeled, remainder 6,800 → (8,0)=7,200 (+400)
    assert.deepEqual(nearestPackPool(50000), { private: 40, group: 32, value: 50400 })
    // 100,000: 4 × 21,600 = 86,400 peeled, remainder 13,600 → (16,0)=14,400
    assert.deepEqual(nearestPackPool(100000), { private: 80, group: 64, value: 100800 })
  })

  it('never selects single-session tiers (named packs only)', () => {
    // private and group packs are both 16k + {0,4,8,12}
    const PACK_REMAINDERS = new Set([0, 4, 8, 12])
    for (const amount of [100, 1000, 2500, 3000, 3333, 4500, 5000, 7200, 10800, 15500, 16000, 50000]) {
      const r = nearestPackPool(amount)
      assert.ok(PACK_REMAINDERS.has(r.private % 16), `private ${r.private} for ${amount} not pack-pure`)
      assert.ok(PACK_REMAINDERS.has(r.group % 16), `group ${r.group} for ${amount} not pack-pure`)
    }
  })
})

describe('pricing parity — server vs frontend (src/data/pricingData.js)', () => {
  const numericKeys = tier =>
    Object.keys(tier).filter(k => !Number.isNaN(Number(k))).map(Number).sort((a, b) => a - b)

  it('tier tables are identical', () => {
    for (const type of ['private', 'group']) {
      const serverKeys = numericKeys(PRICING[type])
      const frontKeys = numericKeys(FRONT_PRICING[type])
      assert.deepEqual(serverKeys, frontKeys, `${type} tier keys differ`)
      for (const k of serverKeys) {
        assert.equal(PRICING[type][k], FRONT_PRICING[type][k], `${type} tier ${k} differs`)
      }
    }
  })

  it('calculatePrice agrees for every count 0..64', () => {
    for (const type of ['private', 'group']) {
      for (let n = 0; n <= 64; n++) {
        assert.equal(
          calculatePrice(type, n),
          frontPrice(type, n),
          `${type} ${n}: server ${calculatePrice(type, n)} vs frontend ${frontPrice(type, n)}`,
        )
      }
    }
  })

  it('packagePrice agrees with the frontend-priced owed amount', () => {
    for (let p = 0; p <= 20; p++) {
      for (let g = 0; g <= 8; g++) {
        assert.equal(
          packagePrice(p, g),
          frontPrice('private', p) + frontPrice('group', g),
          `packagePrice(${p}, ${g})`,
        )
      }
    }
  })
})

describe('staff rate — flat 600/300 (coaches / member_code 007)', () => {
  it('isStaffRateUser detects coaches and Magdy only', async () => {
    const { isStaffRateUser } = await import('../src/utils/pricing.js')
    assert.equal(isStaffRateUser({ role: 'coach' }), true)
    assert.equal(isStaffRateUser({ role: 'coach', member_code: '042' }), true)
    assert.equal(isStaffRateUser({ role: 'player', member_code: '007' }), true)
    assert.equal(isStaffRateUser({ role: 'player', member_code: '007 ' }), true)
    assert.equal(isStaffRateUser({ role: 'admin', member_code: '007' }), true)
    assert.equal(isStaffRateUser({ role: 'player', member_code: '008' }), false)
    assert.equal(isStaffRateUser({ role: 'player', member_code: '07' }), false)
    assert.equal(isStaffRateUser({ role: 'player' }), false)
    assert.equal(isStaffRateUser({ role: 'admin' }), false)
    assert.equal(isStaffRateUser(null), false)
    assert.equal(isStaffRateUser(undefined), false)
  })

  it('flat prices for every count — no packages, no bulk discount', () => {
    for (let n = 0; n <= 20; n++) {
      assert.equal(calculatePrice('private', n, { staff: true }), 600 * n, `private x${n}`)
      assert.equal(calculatePrice('group', n, { staff: true }), 300 * n, `group x${n}`)
    }
    assert.equal(calculatePrice('private', 4, { staff: true }), 2400) // normal tier would be 3,600
    assert.equal(calculatePrice('group', 8, { staff: true }), 2400)   // normal tier would be 3,600
    assert.equal(packagePrice(3, 2, { staff: true }), 3 * 600 + 2 * 300)
    assert.equal(packagePrice(0, 0, { staff: true }), 0)
    assert.equal(calculatePrice('vip', 3, { staff: true }), 0)
  })

  it('amount → session mix at flat rates', () => {
    assert.deepEqual(sessionsForAmount(600, { staff: true }), { private: 1, group: 0, value: 600 })
    assert.deepEqual(sessionsForAmount(300, { staff: true }), { private: 0, group: 1, value: 300 })
    assert.deepEqual(sessionsForAmount(1000, { staff: true }), { private: 1, group: 1, value: 900 })
    assert.deepEqual(sessionsForAmount(1500, { staff: true }), { private: 2, group: 1, value: 1500 })
    assert.deepEqual(sessionsForAmount(1800, { staff: true }), { private: 3, group: 0, value: 1800 })
    assert.deepEqual(sessionsForAmount(400, { staff: true }), { private: 0, group: 1, value: 300 })
    assert.deepEqual(sessionsForAmount(0, { staff: true }), { private: 0, group: 0, value: 0 })
  })

  it('bestCoverage caps at unpaid counts at flat rates', () => {
    assert.deepEqual(bestCoverage(1500, 9, 9, { staff: true }), { private: 2, group: 1, value: 1500 })
    assert.deepEqual(bestCoverage(999999, 5, 2, { staff: true }), { private: 5, group: 2, value: 5 * 600 + 2 * 300 })
    assert.deepEqual(bestCoverage(400, 9, 0, { staff: true }), { private: 0, group: 0, value: 0 })
  })

  it('nearestPackPool degenerates to value-max (no packs for staff)', () => {
    assert.deepEqual(nearestPackPool(1800, 0, { staff: true }), { private: 3, group: 0, value: 1800 })
    assert.deepEqual(nearestPackPool(3000, 3000, { staff: true }), { private: 5, group: 0, value: 3000 })
  })

  it('non-staff path is untouched', () => {
    assert.equal(calculatePrice('private', 4), 3600)
    assert.equal(packagePrice(16, 3), 15900)
    assert.deepEqual(sessionsForAmount(14400), { private: 16, group: 0, value: 14400 })
  })
})

describe('staff rate parity — server vs frontend (src/data/pricingData.js)', () => {
  it('STAFF_PRICING tables are identical', () => {
    assert.deepEqual(STAFF_PRICING, FRONT_STAFF_PRICING)
  })

  it('staff calculatePrice agrees for every count 0..64', () => {
    for (const type of ['private', 'group']) {
      for (let n = 0; n <= 64; n++) {
        assert.equal(
          calculatePrice(type, n, { staff: true }),
          frontPrice(type, n, { staff: true }),
          `staff ${type} ${n}: server ${calculatePrice(type, n, { staff: true })} vs frontend ${frontPrice(type, n, { staff: true })}`,
        )
      }
    }
  })
})
