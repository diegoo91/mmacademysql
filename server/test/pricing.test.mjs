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
  calculatePrice,
  packagePrice,
  bestCoverage,
  sessionsForAmount,
} from '../src/utils/pricing.js'
import {
  PRICING as FRONT_PRICING,
  calculatePrice as frontPrice,
} from '../../src/data/pricingData.js'

describe('calculatePrice — tier values', () => {
  it('private tiers', () => {
    assert.equal(calculatePrice('private', 1), 1000)
    assert.equal(calculatePrice('private', 4), 3600)
    assert.equal(calculatePrice('private', 8), 7000)
    assert.equal(calculatePrice('private', 12), 10800)
    assert.equal(calculatePrice('private', 16), 14000)
  })

  it('group tiers', () => {
    assert.equal(calculatePrice('group', 1), 500)
    assert.equal(calculatePrice('group', 4), 1800)
    assert.equal(calculatePrice('group', 8), 3500)
    assert.equal(calculatePrice('group', 16), 7000)
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
    assert.equal(calculatePrice('private', 5), 3600 + 1000) // 4 + 1
    assert.equal(calculatePrice('private', 9), 7000 + 1000) // 8 + 1
    assert.equal(calculatePrice('private', 15), 10800 + 3000) // 12 + 3 singles
    assert.equal(calculatePrice('private', 17), 14000 + 1000) // 16 + 1
    assert.equal(calculatePrice('private', 20), 14000 + 3600) // 16 + 4
  })

  it('group splits (singles at 500)', () => {
    assert.equal(calculatePrice('group', 3), 3 * 500)
    assert.equal(calculatePrice('group', 9), 3500 + 500) // 8 + 1
    assert.equal(calculatePrice('group', 20), 7000 + 1800) // 16 + 4
    assert.equal(calculatePrice('group', 24), 7000 + 3500) // 16 + 8
  })

  it('the regression cases: 9 private = 8,000 and 16P + 3G = 15,500', () => {
    assert.equal(calculatePrice('private', 9), 8000)
    assert.equal(packagePrice(16, 3), 15500)
    assert.equal(packagePrice(15, 3), 15300) // Hassan: 15P + 3G
    assert.equal(packagePrice(18, 0), 14000 + 2 * 1000) // 16 + 2 singles
  })
})

describe('packagePrice', () => {
  it('adds both types', () => {
    assert.equal(packagePrice(8, 4), 7000 + 1800)
    assert.equal(packagePrice(1, 1), 1500)
    assert.equal(packagePrice(16, 16), 14000 + 7000)
  })
})

describe('bestCoverage — fixed cases', () => {
  it('7,000 against 9 unpaid private covers 8 (the partial-payment case)', () => {
    assert.deepEqual(bestCoverage(7000, 9, 0), { private: 8, group: 0, value: 7000 })
  })

  it('paying the full owed covers everything, no credit', () => {
    assert.deepEqual(bestCoverage(15500, 16, 3), { private: 16, group: 3, value: 15500 })
    // 9 unpaid private cost exactly 8,000 (8-pack + single) → all 9 covered
    assert.deepEqual(bestCoverage(8000, 9, 0), { private: 9, group: 0, value: 8000 })
  })

  it('an amount below the cheapest session covers nothing', () => {
    assert.deepEqual(bestCoverage(400, 9, 0), { private: 0, group: 0, value: 0 })
    assert.deepEqual(bestCoverage(0, 9, 9), { private: 0, group: 0, value: 0 })
    assert.deepEqual(bestCoverage(-500, 9, 9), { private: 0, group: 0, value: 0 })
  })

  it('is capped by what is unpaid (overpay never over-covers)', () => {
    assert.deepEqual(bestCoverage(999999, 16, 3), { private: 16, group: 3, value: 15500 })
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
    // 3,600 → group 16-pack costs 7,000, too much: best is 4 private (3,600)
    assert.deepEqual(bestCoverage(3600, 9, 9), { private: 4, group: 0, value: 3600 })
    // 8,500 → ties between 8P+3G (7,000+1,500) and 9P+1G (8,000+500);
    // same value → more private wins → 9P + 1G
    assert.deepEqual(bestCoverage(8500, 20, 9), { private: 9, group: 1, value: 8500 })
  })
})

describe('bestCoverage — brute-force cross-check', () => {
  const amounts = [0, 500, 999, 1000, 1500, 1800, 3500, 3600, 7000, 7999, 8000, 10800, 14000, 15500, 15800]
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
    assert.deepEqual(sessionsForAmount(7000), { private: 8, group: 0, value: 7000 })
    assert.deepEqual(sessionsForAmount(1000), { private: 1, group: 0, value: 1000 })
    assert.deepEqual(sessionsForAmount(1500), { private: 1, group: 1, value: 1500 })
    assert.deepEqual(sessionsForAmount(400), { private: 0, group: 0, value: 0 })
    assert.deepEqual(sessionsForAmount(0), { private: 0, group: 0, value: 0 })
  })

  it('never spends more than the amount', () => {
    for (const amount of [1, 999, 1001, 3500, 6999, 13999, 25000]) {
      const got = sessionsForAmount(amount)
      assert.ok(got.value <= amount, `sessionsForAmount(${amount}) value ${got.value} > amount`)
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
