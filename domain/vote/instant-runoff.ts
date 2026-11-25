/**
 * Instant-runoff vote count, as a pure function: ballots in, rounds out.
 *
 * Rules, in the order they apply:
 *
 * 1. A ballot is a member's ranking, best first. It may rank only some
 *    candidates. Ids that aren't candidates are ignored, and a repeated id
 *    counts only where it first appears.
 * 2. Each round, every ballot counts once, for its highest-ranked candidate
 *    still in the race. A ballot with none left is exhausted and sits out.
 * 3. A candidate with more than half of the ballots still counting wins.
 *    So does the last candidate standing.
 * 4. Otherwise the candidate with the fewest votes is eliminated, one per
 *    round, so the reveal can replay the count step by step.
 * 5. A tie for fewest is broken by looking back: the tied candidate with
 *    fewer votes in the latest earlier round where they differ goes out.
 *    If they were level in every round, the one that comes last in the
 *    candidate list goes out. The caller passes the shortlist in the order
 *    items were added, so the newest addition loses an unbreakable tie.
 *    No randomness, so the same ballots always give the same result.
 */

export type CandidateId = string

export type Ballot = readonly CandidateId[]

export type Round = {
  /** 1-based round number. */
  number: number
  /** Votes for each candidate still in the race at the start of the round. */
  tallies: Record<CandidateId, number>
  /** Ballots counting toward someone this round. */
  active: number
  /** Ballots with no candidate left, cumulative. */
  exhausted: number
  /** Who goes out at the end of this round, or null in the deciding round. */
  eliminated: CandidateId | null
  /** Set only in the deciding round. */
  winner: CandidateId | null
  /** How the elimination or win was decided, for the round-by-round reveal. */
  reason: RoundReason
}

export type RoundReason =
  | { kind: 'majority' }
  | { kind: 'last-standing' }
  | { kind: 'fewest-votes' }
  | { kind: 'tie-broken-by-earlier-round'; round: number; tied: CandidateId[] }
  | { kind: 'tie-broken-by-list-order'; tied: CandidateId[] }

export type InstantRunoffResult = {
  winner: CandidateId | null
  rounds: Round[]
}

export function instantRunoff(candidates: readonly CandidateId[], ballots: readonly Ballot[]): InstantRunoffResult {
  const unique = dedupe(candidates)
  if (unique.length === 0) return { winner: null, rounds: [] }

  const known = new Set(unique)
  const cleaned = ballots.map((ballot) => dedupe(ballot).filter((id) => known.has(id)))
  if (cleaned.every((ballot) => ballot.length === 0)) return { winner: null, rounds: [] }

  const listOrder = new Map(unique.map((id, index) => [id, index]))
  const continuing = new Set(unique)
  const rounds: Round[] = []

  while (continuing.size > 0) {
    // No prototype, so an id like "__proto__" or "constructor" is just a key.
    const tallies: Record<CandidateId, number> = Object.create(null)
    for (const id of unique) if (continuing.has(id)) tallies[id] = 0

    let active = 0
    for (const ballot of cleaned) {
      const choice = ballot.find((id) => continuing.has(id))
      if (choice === undefined) continue
      tallies[choice] = (tallies[choice] ?? 0) + 1
      active++
    }
    const exhausted = cleaned.length - active
    const number = rounds.length + 1

    const leader = topCandidate(tallies, listOrder)
    if (continuing.size === 1 || (leader !== null && (tallies[leader] ?? 0) * 2 > active)) {
      rounds.push({
        number,
        tallies,
        active,
        exhausted,
        eliminated: null,
        winner: leader,
        reason: { kind: continuing.size === 1 ? 'last-standing' : 'majority' },
      })
      return { winner: leader, rounds }
    }

    const { loser, reason } = pickLoser(tallies, rounds, listOrder)
    rounds.push({ number, tallies, active, exhausted, eliminated: loser, winner: null, reason })
    continuing.delete(loser)
  }

  // Unreachable: the loop returns once one candidate is left.
  return { winner: null, rounds }
}

function dedupe(ids: readonly CandidateId[]): CandidateId[] {
  return [...new Set(ids)]
}

/** The candidate with the most votes; list order breaks a tie, but a tied top can't be a majority anyway. */
function topCandidate(tallies: Record<CandidateId, number>, listOrder: Map<CandidateId, number>): CandidateId | null {
  let best: CandidateId | null = null
  for (const [id, votes] of Object.entries(tallies)) {
    if (best === null) {
      best = id
      continue
    }
    const bestVotes = tallies[best] ?? 0
    if (votes > bestVotes || (votes === bestVotes && order(listOrder, id) < order(listOrder, best))) best = id
  }
  return best
}

function pickLoser(
  tallies: Record<CandidateId, number>,
  earlier: readonly Round[],
  listOrder: Map<CandidateId, number>,
): { loser: CandidateId; reason: RoundReason } {
  const fewest = Math.min(...Object.values(tallies))
  let tied = Object.keys(tallies).filter((id) => tallies[id] === fewest)
  if (tied.length === 1) return { loser: tied[0]!, reason: { kind: 'fewest-votes' } }

  const allTied = sortByListOrder(tied, listOrder)
  for (let i = earlier.length - 1; i >= 0; i--) {
    const past = earlier[i]!.tallies
    const low = Math.min(...tied.map((id) => past[id] ?? 0))
    const lowest = tied.filter((id) => (past[id] ?? 0) === low)
    if (lowest.length < tied.length) tied = lowest
    if (tied.length === 1) {
      return {
        loser: tied[0]!,
        reason: { kind: 'tie-broken-by-earlier-round', round: earlier[i]!.number, tied: allTied },
      }
    }
  }

  const last = sortByListOrder(tied, listOrder).at(-1)!
  return { loser: last, reason: { kind: 'tie-broken-by-list-order', tied: allTied } }
}

function sortByListOrder(ids: CandidateId[], listOrder: Map<CandidateId, number>): CandidateId[] {
  return [...ids].sort((a, b) => order(listOrder, a) - order(listOrder, b))
}

function order(listOrder: Map<CandidateId, number>, id: CandidateId): number {
  return listOrder.get(id) ?? Number.MAX_SAFE_INTEGER
}
