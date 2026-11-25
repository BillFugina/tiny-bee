import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MEDIAN_ID,
  estimateMinutes,
  estimatedTravelTimes,
  findFairAreas,
  generateCandidates,
  pruneCandidates,
  scoreCandidates,
  type Candidate,
  type Place,
  type TravelTimeMatrix,
  type TravelTimeProvider,
  type Traveler,
} from '../domain/fairness/engine.js'
import { distanceKm, geometricMedian, type LatLng } from '../domain/fairness/geo.js'

const raleigh = { lat: 35.7796, lng: -78.6382 }
const durham = { lat: 35.994, lng: -78.8986 }
const chapelHill = { lat: 35.9132, lng: -79.0558 }
const greensboro = { lat: 36.0726, lng: -79.792 }
const charlotte = { lat: 35.2271, lng: -80.8431 }
const wilmington = { lat: 34.2104, lng: -77.8868 }

const place = (id: string, at: LatLng): Place => ({ id, name: id, ...at })
const towns = [
  place('raleigh', raleigh),
  place('durham', durham),
  place('chapel-hill', chapelHill),
  place('greensboro', greensboro),
  place('charlotte', charlotte),
  place('wilmington', wilmington),
]
const traveler = (memberId: string, origin: LatLng, maxMinutes = 240): Traveler => ({ memberId, origin, maxMinutes })
const candidate = (id: string, at: LatLng = raleigh): Candidate => ({ id, name: id, ...at, source: 'place' })

describe('geo', () => {
  it('measures great-circle distance', () => {
    // Raleigh to Durham is about 34 km as the crow flies.
    expect(distanceKm(raleigh, durham)).toBeGreaterThan(30)
    expect(distanceKm(raleigh, durham)).toBeLessThan(38)
    expect(distanceKm(raleigh, raleigh)).toBe(0)
  })

  it('puts the median on the point for one person, and between two', () => {
    expect(geometricMedian([raleigh])).toEqual(raleigh)
    const mid = geometricMedian([raleigh, durham, chapelHill])
    expect(distanceKm(mid, durham)).toBeLessThan(distanceKm(raleigh, durham))
  })

  it('does not let one far-off person drag the median away', () => {
    const cluster = [raleigh, raleigh, raleigh, durham]
    const withOutlier = geometricMedian([...cluster, charlotte])
    // The plain average would move about 40 km toward Charlotte; the median moves far less.
    expect(distanceKm(withOutlier, geometricMedian(cluster))).toBeLessThan(20)
  })
})

describe('scoreCandidates', () => {
  const travelers = [traveler('ann', raleigh, 60), traveler('bo', durham, 60)]

  it('ranks by the longest trip by default and reports everyone’s time', () => {
    const minutes: TravelTimeMatrix = [
      [10, 30, 25],
      [50, 30, 20],
    ]
    const { areas } = scoreCandidates(travelers, [candidate('x'), candidate('y'), candidate('z')], minutes)
    expect(areas.map((a) => a.candidate.id)).toEqual(['z', 'y', 'x'])
    expect(areas[0]).toMatchObject({
      longest: 25,
      average: 22.5,
      times: [
        { memberId: 'ann', minutes: 25, maxMinutes: 60 },
        { memberId: 'bo', minutes: 20, maxMinutes: 60 },
      ],
    })
  })

  it('blends in the average as the slider moves', () => {
    // x: longest 40, average 25. y: longest 35, average 35.
    const minutes: TravelTimeMatrix = [
      [10, 35],
      [40, 35],
    ]
    const ids = (averageWeight: number) =>
      scoreCandidates(travelers, [candidate('x'), candidate('y')], minutes, { averageWeight }).areas.map(
        (a) => a.candidate.id,
      )
    expect(ids(0)).toEqual(['y', 'x'])
    expect(ids(1)).toEqual(['x', 'y'])
  })

  it('separates areas over someone’s limit, fewest people over first', () => {
    const minutes: TravelTimeMatrix = [
      [70, 80, 30],
      [70, 20, 30],
    ]
    const result = scoreCandidates(travelers, [candidate('both'), candidate('one'), candidate('ok')], minutes)
    expect(result.areas.map((a) => a.candidate.id)).toEqual(['ok'])
    expect(result.overLimit.map((a) => [a.candidate.id, a.overLimitCount])).toEqual([
      ['one', 1],
      ['both', 2],
    ])
  })

  it('leaves out a place someone has no route to', () => {
    const result = scoreCandidates(
      travelers,
      [candidate('island'), candidate('town')],
      [
        [5, 30],
        [null, 30],
      ],
    )
    expect(result.areas.map((a) => a.candidate.id)).toEqual(['town'])
    expect(result.overLimit).toEqual([])
  })

  it('breaks exact ties by candidate id, so results never wobble', () => {
    const minutes: TravelTimeMatrix = [
      [30, 30],
      [30, 30],
    ]
    const { areas } = scoreCandidates(travelers, [candidate('b'), candidate('a')], minutes)
    expect(areas.map((a) => a.candidate.id)).toEqual(['a', 'b'])
  })

  it('rejects bad input', () => {
    expect(() => scoreCandidates([], [], [])).toThrow(RangeError)
    expect(() => scoreCandidates(travelers, [candidate('x')], [[1]])).toThrow(RangeError)
    expect(() => scoreCandidates(travelers, [candidate('x')], [[1], [1]], { averageWeight: 2 })).toThrow(RangeError)
    expect(() => scoreCandidates([traveler('z', raleigh, 0)], [candidate('x')], [[1]])).toThrow(RangeError)
  })
})

describe('generateCandidates and pruneCandidates', () => {
  const triangle = [traveler('ann', raleigh), traveler('bo', durham), traveler('cy', chapelHill)]

  it('starts from the median and adds nearby towns, nearest first', () => {
    const candidates = generateCandidates(triangle, towns, { bufferKm: 10 })
    expect(candidates[0]!.id).toBe(MEDIAN_ID)
    expect(candidates.map((c) => c.id)).toEqual(expect.arrayContaining(['raleigh', 'durham', 'chapel-hill']))
    expect(candidates.map((c) => c.id)).not.toContain('charlotte')
  })

  it('respects the candidate limit', () => {
    expect(generateCandidates(triangle, towns, { bufferKm: 500, limit: 3 })).toHaveLength(3)
  })

  it('drops towns that clearly break a limit and keeps the best few', () => {
    const tight = [traveler('ann', raleigh, 45), traveler('bo', durham, 45)]
    const candidates = generateCandidates(tight, towns, { bufferKm: 500 })
    const kept = pruneCandidates(tight, candidates, { keep: 2 }).map((c) => c.id)
    expect(kept).toHaveLength(2)
    expect(kept).not.toContain('charlotte')
    expect(kept).not.toContain('wilmington')
  })

  it('keeps the closest misses when nothing fits, so the planner can explain', () => {
    const impossible = [traveler('ann', raleigh, 10), traveler('bo', charlotte, 10)]
    const kept = pruneCandidates(impossible, generateCandidates(impossible, towns, { bufferKm: 50 }))
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThanOrEqual(3)
  })
})

describe('findFairAreas', () => {
  it('calls the travel-time provider once, for people x finalists', async () => {
    const calls: [number, number][] = []
    const provider: TravelTimeProvider = {
      async matrix(origins, destinations) {
        calls.push([origins.length, destinations.length])
        return estimatedTravelTimes().matrix(origins, destinations)
      },
    }
    const travelers = [traveler('ann', raleigh, 90), traveler('bo', greensboro, 90), traveler('cy', durham, 90)]
    const result = await findFairAreas({
      travelers,
      places: towns,
      travelTimes: provider,
      candidates: { bufferKm: 50 },
      prune: { keep: 4 },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toBe(3)
    expect(calls[0]![1]).toBeLessThanOrEqual(4)
    // Greensboro to Raleigh is the long leg, so the best area sits between them, not at either end.
    expect(['raleigh', 'greensboro']).not.toContain(result.areas[0]!.candidate.id)
    for (const area of result.areas) expect(area.longest).toBeLessThanOrEqual(90)
  })

  it('skips the provider when there is nothing to price', async () => {
    let called = false
    const provider: TravelTimeProvider = {
      async matrix() {
        called = true
        return []
      },
    }
    const result = await findFairAreas({
      travelers: [traveler('ann', raleigh)],
      places: [],
      travelTimes: provider,
      prune: { keep: 0 },
    })
    expect(called).toBe(false)
    expect(result).toEqual({ areas: [], overLimit: [] })
  })
})

// Property-based tests over random groups in and around North Carolina.
const point = fc.record({
  lat: fc.double({ min: 33.8, max: 36.6, noNaN: true }),
  lng: fc.double({ min: -84.3, max: -75.5, noNaN: true }),
})
const group = fc.array(fc.record({ origin: point, maxMinutes: fc.integer({ min: 30, max: 600 }) }), {
  minLength: 1,
  maxLength: 8,
})
const toTravelers = (g: { origin: LatLng; maxMinutes: number }[]) =>
  g.map((t, i) => traveler(`m${i}`, t.origin, t.maxMinutes))

describe('fairness properties', () => {
  it('the median is never farther in total than any member’s own start', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 8 }), (points) => {
        const total = (p: LatLng) => points.reduce((s, q) => s + distanceKm(p, q), 0)
        const median = geometricMedian(points)
        for (const p of points) expect(total(median)).toBeLessThanOrEqual(total(p) + 0.5)
      }),
    )
  })

  it('with the slider at 0, no feasible area has a shorter longest trip than the top one', () => {
    fc.assert(
      fc.property(group, fc.array(point, { minLength: 1, maxLength: 20 }), (g, spots) => {
        const travelers = toTravelers(g)
        const candidates = spots.map((s, i) => candidate(`p${i}`, s))
        const minutes = travelers.map((t) => candidates.map((c) => estimateMinutes(t.origin, c)))
        const { areas, overLimit } = scoreCandidates(travelers, candidates, minutes)
        expect(areas.length + overLimit.length).toBe(candidates.length)
        if (areas.length > 0) for (const a of areas) expect(a.longest).toBeGreaterThanOrEqual(areas[0]!.longest)
        for (const a of areas) expect(a.times.every((t) => t.minutes <= t.maxMinutes)).toBe(true)
        for (const a of overLimit) expect(a.overLimitCount).toBeGreaterThan(0)
      }),
    )
  })

  it('the order people are listed in never changes the ranking', () => {
    fc.assert(
      fc.property(
        group.chain((g) => fc.record({ g: fc.constant(g), shuffled: fc.shuffledSubarray(g, { minLength: g.length }) })),
        fc.array(point, { minLength: 1, maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ({ g, shuffled }, spots, averageWeight) => {
          const candidates = spots.map((s, i) => candidate(`p${i}`, s))
          const rank = (travelers: Traveler[]) => {
            const minutes = travelers.map((t) => candidates.map((c) => estimateMinutes(t.origin, c)))
            const { areas, overLimit } = scoreCandidates(travelers, candidates, minutes, { averageWeight })
            return [...areas, ...overLimit].map((a) => a.candidate.id)
          }
          const byOrigin = new Map(g.map((t, i) => [t, `m${i}`]))
          const reordered = shuffled.map((t) => traveler(byOrigin.get(t)!, t.origin, t.maxMinutes))
          expect(rank(reordered)).toEqual(rank(toTravelers(g)))
        },
      ),
    )
  })
})
