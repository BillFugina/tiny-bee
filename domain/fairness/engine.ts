/**
 * The fairness engine: where can a group meet so the trip is fair on everyone?
 *
 * It never asks a maps API to search everywhere. It prunes cheaply first, then
 * pays for real travel times on a short list:
 *
 * 1. Candidates: the geometric median of everyone's start, plus known places
 *    (towns) near the group.
 * 2. Prune for free: estimate each trip from straight-line distance, drop
 *    candidates that clearly break someone's limit, keep the best few.
 * 3. Real times: one travel-time matrix for people x finalists, through a
 *    provider the caller supplies (a maps API in production, estimates in tests).
 * 4. Score: rank by the longest single trip (minimax), with a slider that
 *    blends in the group's average trip, and report every person's time so
 *    the result explains itself.
 *
 * Everything here is pure except the provider call, so it is tested without a
 * network and a maps vendor can change without touching the logic.
 */

import { distanceKm, geometricMedian, type LatLng } from './geo.js'

export type Traveler = {
  memberId: string
  origin: LatLng
  /** The longest trip this person will make, in minutes. */
  maxMinutes: number
}

export type Place = LatLng & { id: string; name: string }

export type Candidate = Place & { source: 'median' | 'place' }

export const MEDIAN_ID = 'median'

/** Near misses to price when nothing fits everyone's limit. */
const CLOSEST_MISSES = 3

/** Travel times in minutes: rows are origins, columns are destinations; null means no route. */
export type TravelTimeMatrix = (number | null)[][]

export interface TravelTimeProvider {
  matrix(origins: readonly LatLng[], destinations: readonly LatLng[]): Promise<TravelTimeMatrix>
}

export type ScoreOptions = {
  /**
   * The fairness slider, from 0 to 1. At 0 areas rank purely by the longest
   * single trip (fairest); at 1 purely by the average trip (least total driving).
   */
  averageWeight?: number
}

export type MemberTime = { memberId: string; minutes: number; maxMinutes: number }

export type ScoredArea = {
  candidate: Candidate
  times: MemberTime[]
  longest: number
  average: number
  score: number
  /** How many people this area puts over their limit. */
  overLimitCount: number
}

export type FairAreas = {
  /** Areas within everyone's limit, best first. */
  areas: ScoredArea[]
  /** Areas that put at least one person over their limit, fewest over and then best score first. */
  overLimit: ScoredArea[]
}

export type CandidateOptions = {
  /** Extra room around the group, in km, when picking nearby places. */
  bufferKm?: number
  /** Most candidates to consider, the median included. */
  limit?: number
}

/** Step 1: the median of everyone's start plus the nearest known places around the group. */
export function generateCandidates(
  travelers: readonly Traveler[],
  places: readonly Place[],
  { bufferKm = 25, limit = 100 }: CandidateOptions = {},
): Candidate[] {
  assertTravelers(travelers)
  const median = geometricMedian(travelers.map((t) => t.origin))
  const reach = Math.max(...travelers.map((t) => distanceKm(median, t.origin))) + bufferKm

  const nearby = places
    .map((place) => ({ place, d: distanceKm(median, place) }))
    .filter(({ d }) => d <= reach)
    .sort((a, b) => a.d - b.d || compareIds(a.place.id, b.place.id))
    .slice(0, Math.max(0, limit - 1))
    .map(({ place }): Candidate => ({ ...place, source: 'place' }))

  return [{ id: MEDIAN_ID, name: 'Midpoint', ...median, source: 'median' }, ...nearby]
}

export type EstimateOptions = {
  /** Roads are longer than a straight line; 1.3 is a common rule of thumb. */
  roadFactor?: number
  /** Average driving speed, km/h. */
  averageKmh?: number
}

/** A free, rough drive time: straight-line distance times a road factor, at an average speed. */
export function estimateMinutes(from: LatLng, to: LatLng, { roadFactor = 1.3, averageKmh = 80 }: EstimateOptions = {}) {
  return ((distanceKm(from, to) * roadFactor) / averageKmh) * 60
}

export function estimateMatrix(
  origins: readonly LatLng[],
  destinations: readonly LatLng[],
  options?: EstimateOptions,
): TravelTimeMatrix {
  return origins.map((o) => destinations.map((d) => estimateMinutes(o, d, options)))
}

/** A provider that answers with estimates, for tests and for running without a maps key. */
export function estimatedTravelTimes(options?: EstimateOptions): TravelTimeProvider {
  return { matrix: async (origins, destinations) => estimateMatrix(origins, destinations, options) }
}

export type PruneOptions = ScoreOptions &
  EstimateOptions & {
    /** How many finalists to keep for real travel times. */
    keep?: number
    /**
     * Estimates are rough, so a candidate is dropped only when its estimate is
     * over someone's limit by more than this factor. 1.15 keeps borderline
     * places for the real check.
     */
    limitSlack?: number
  }

/**
 * Step 2: score candidates on estimated times, drop clear misses, keep the best few.
 * If nothing fits everyone's limit even loosely, keep the few closest misses
 * instead, so the planner can say how close the group can get.
 */
export function pruneCandidates(
  travelers: readonly Traveler[],
  candidates: readonly Candidate[],
  { keep = 15, limitSlack = 1.15, ...options }: PruneOptions = {},
): Candidate[] {
  assertTravelers(travelers)
  const estimates = estimateMatrix(
    travelers.map((t) => t.origin),
    candidates,
    options,
  )
  const loose = travelers.map((t) => ({ ...t, maxMinutes: t.maxMinutes * limitSlack }))
  const { areas, overLimit } = scoreCandidates(loose, candidates, estimates, options)
  const kept = areas.length > 0 ? areas.slice(0, keep) : overLimit.slice(0, Math.min(keep, CLOSEST_MISSES))
  return kept.map((area) => area.candidate)
}

/** Step 4: rank candidates by real (or estimated) times. Pure and deterministic. */
export function scoreCandidates(
  travelers: readonly Traveler[],
  candidates: readonly Candidate[],
  minutes: TravelTimeMatrix,
  { averageWeight = 0 }: ScoreOptions = {},
): FairAreas {
  assertTravelers(travelers)
  if (!(averageWeight >= 0 && averageWeight <= 1)) throw new RangeError('averageWeight must be between 0 and 1')
  if (minutes.length !== travelers.length || minutes.some((row) => row.length !== candidates.length)) {
    throw new RangeError('travel-time matrix must be travelers x candidates')
  }

  const scored: ScoredArea[] = []
  for (const [column, candidate] of candidates.entries()) {
    const times: MemberTime[] = []
    let reachable = true
    for (const [row, traveler] of travelers.entries()) {
      const m = minutes[row]![column]
      if (m === null || m === undefined || !Number.isFinite(m) || m < 0) {
        reachable = false
        break
      }
      times.push({ memberId: traveler.memberId, minutes: m, maxMinutes: traveler.maxMinutes })
    }
    // No route for someone: not a place this group can meet at all.
    if (!reachable) continue

    const longest = Math.max(...times.map((t) => t.minutes))
    const average = times.reduce((s, t) => s + t.minutes, 0) / times.length
    scored.push({
      candidate,
      times,
      longest,
      average,
      score: (1 - averageWeight) * longest + averageWeight * average,
      overLimitCount: times.filter((t) => t.minutes > t.maxMinutes).length,
    })
  }

  const byScore = (a: ScoredArea, b: ScoredArea) =>
    a.score - b.score || a.longest - b.longest || a.average - b.average || compareIds(a.candidate.id, b.candidate.id)

  return {
    areas: scored.filter((s) => s.overLimitCount === 0).sort(byScore),
    overLimit: scored
      .filter((s) => s.overLimitCount > 0)
      .sort((a, b) => a.overLimitCount - b.overLimitCount || byScore(a, b)),
  }
}

export type FindFairAreasInput = {
  travelers: readonly Traveler[]
  places: readonly Place[]
  travelTimes: TravelTimeProvider
  candidates?: CandidateOptions
  prune?: PruneOptions
} & ScoreOptions

/** Steps 1 to 4 together. The provider is called once, for people x finalists. */
export async function findFairAreas(input: FindFairAreasInput): Promise<FairAreas> {
  const { travelers, places, travelTimes, averageWeight } = input
  const candidates = generateCandidates(travelers, places, input.candidates)
  const finalists = pruneCandidates(travelers, candidates, { averageWeight, ...input.prune })
  if (finalists.length === 0) return { areas: [], overLimit: [] }

  const matrix = await travelTimes.matrix(
    travelers.map((t) => t.origin),
    finalists,
  )
  return scoreCandidates(travelers, finalists, matrix, { averageWeight })
}

function assertTravelers(travelers: readonly Traveler[]) {
  if (travelers.length === 0) throw new RangeError('at least one traveler is needed')
  for (const t of travelers) {
    if (!(t.maxMinutes > 0)) throw new RangeError(`maxMinutes must be positive for ${t.memberId}`)
  }
}

function compareIds(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}
