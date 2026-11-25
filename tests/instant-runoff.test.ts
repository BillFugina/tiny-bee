import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { instantRunoff, type Ballot } from '../domain/vote/instant-runoff.js'

const repeat = (ballot: Ballot, times: number): Ballot[] => Array.from({ length: times }, () => ballot)

describe('instantRunoff', () => {
  it('returns no winner when there are no candidates or no usable ballots', () => {
    expect(instantRunoff([], [['a']])).toEqual({ winner: null, rounds: [] })
    expect(instantRunoff(['a', 'b'], [])).toEqual({ winner: null, rounds: [] })
    expect(instantRunoff(['a', 'b'], [[], ['zzz']])).toEqual({ winner: null, rounds: [] })
  })

  it('declares a first-round majority', () => {
    const result = instantRunoff(['a', 'b', 'c'], [...repeat(['a'], 3), ['b'], ['c']])
    expect(result.winner).toBe('a')
    expect(result.rounds).toHaveLength(1)
    expect(result.rounds[0]).toMatchObject({ tallies: { a: 3, b: 1, c: 1 }, active: 5, reason: { kind: 'majority' } })
  })

  it('transfers votes from the eliminated candidate', () => {
    // a 4, b 3, c 2 (c voters prefer b next) -> c out, b wins 5 to 4.
    const ballots = [...repeat(['a'], 4), ...repeat(['b'], 3), ...repeat(['c', 'b'], 2)]
    const result = instantRunoff(['a', 'b', 'c'], ballots)
    expect(result.winner).toBe('b')
    expect(result.rounds.map((r) => r.eliminated)).toEqual(['c', null])
    expect(result.rounds[1]!.tallies).toEqual({ a: 4, b: 5 })
  })

  it('counts exhausted ballots and needs a majority of the ballots still counting', () => {
    // c out; its 2 ballots rank nobody else, so 7 still count and a's 4 is a majority.
    const ballots = [...repeat(['a'], 4), ...repeat(['b'], 3), ...repeat(['c'], 2)]
    const result = instantRunoff(['a', 'b', 'c'], ballots)
    expect(result.winner).toBe('a')
    expect(result.rounds[1]).toMatchObject({ active: 7, exhausted: 2, reason: { kind: 'majority' } })
  })

  it('ignores unknown ids and repeats within a ballot', () => {
    const result = instantRunoff(['a', 'b'], [['x', 'b', 'b', 'a'], ['a'], ['b']])
    expect(result.rounds[0]!.tallies).toEqual({ a: 1, b: 2 })
    expect(result.winner).toBe('b')
  })

  it('breaks a tie for last using the latest earlier round where the tied candidates differ', () => {
    // Round 1: a 5, b 4, c 3, d 1 -> d out, and its ballot moves to c.
    // Round 2: a 5, b 4, c 4 -> b and c tie for last; c had fewer in round 1, so c goes.
    const ballots = [...repeat(['a'], 5), ...repeat(['b'], 4), ...repeat(['c'], 3), ['d', 'c']]
    const result = instantRunoff(['a', 'b', 'c', 'd'], ballots)
    expect(result.rounds[0]).toMatchObject({ eliminated: 'd', reason: { kind: 'fewest-votes' } })
    expect(result.rounds[1]!.tallies).toEqual({ a: 5, b: 4, c: 4 })
    expect(result.rounds[1]).toMatchObject({
      eliminated: 'c',
      reason: { kind: 'tie-broken-by-earlier-round', round: 1, tied: ['b', 'c'] },
    })
  })

  it('breaks an unbreakable tie by dropping the candidate latest in the list', () => {
    const result = instantRunoff(['a', 'b', 'c'], [['a'], ['b'], ['c']])
    expect(result.rounds[0]).toMatchObject({ eliminated: 'c', reason: { kind: 'tie-broken-by-list-order' } })
    expect(result.rounds[1]).toMatchObject({ eliminated: 'b', reason: { kind: 'tie-broken-by-list-order' } })
    expect(result.winner).toBe('a')
    expect(result.rounds[2]).toMatchObject({ winner: 'a', reason: { kind: 'last-standing' } })
  })

  it('eliminates candidates nobody voted for one round at a time', () => {
    const result = instantRunoff(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'a'], ['a']])
    expect(result.winner).toBe('a')
    expect(result.rounds[0]!.tallies).toEqual({ a: 2, b: 1, c: 0, d: 0 })
    // a has 2 of 3: a majority straight away.
    expect(result.rounds).toHaveLength(1)
  })
})

// Property-based tests: random elections, checked against rules any correct count must keep.
const election = fc.integer({ min: 1, max: 6 }).chain((n) => {
  const candidates = Array.from({ length: n }, (_, i) => `c${i}`)
  const ballot = fc.shuffledSubarray(candidates, { minLength: 0, maxLength: n })
  return fc.record({ candidates: fc.constant(candidates), ballots: fc.array(ballot, { maxLength: 40 }) })
})

describe('instantRunoff properties', () => {
  it('a candidate ranked first on more than half of all ballots always wins', () => {
    fc.assert(
      fc.property(election, fc.nat(), ({ candidates, ballots }, pick) => {
        const favourite = candidates[pick % candidates.length]!
        const others = ballots.filter((b) => b[0] !== favourite)
        const backers = Array.from({ length: others.length + 1 }, () => [favourite])
        expect(instantRunoff(candidates, [...others, ...backers]).winner).toBe(favourite)
      }),
    )
  })

  it('every round accounts for every ballot, and the winner is a candidate', () => {
    fc.assert(
      fc.property(election, ({ candidates, ballots }) => {
        const result = instantRunoff(candidates, ballots)
        for (const round of result.rounds) {
          const counted = Object.values(round.tallies).reduce((s, v) => s + v, 0)
          expect(counted).toBe(round.active)
          expect(round.active + round.exhausted).toBe(ballots.length)
        }
        if (result.winner !== null) expect(candidates).toContain(result.winner)
        else expect(ballots.every((b) => b.length === 0)).toBe(true)
      }),
    )
  })

  it('the order ballots arrive in never changes the result', () => {
    fc.assert(
      fc.property(
        election.chain((e) =>
          fc.record({ e: fc.constant(e), shuffled: fc.shuffledSubarray(e.ballots, { minLength: e.ballots.length }) }),
        ),
        ({ e, shuffled }) => {
          expect(instantRunoff(e.candidates, shuffled)).toEqual(instantRunoff(e.candidates, e.ballots))
        },
      ),
    )
  })

  it('a candidate who loses head to head against every other candidate never wins', () => {
    // Instant-runoff keeps the Condorcet loser criterion. Only full rankings, so head to head is well defined.
    const full = fc.integer({ min: 2, max: 5 }).chain((n) => {
      const candidates = Array.from({ length: n }, (_, i) => `c${i}`)
      const ballot = fc.shuffledSubarray(candidates, { minLength: n, maxLength: n })
      return fc.record({
        candidates: fc.constant(candidates),
        ballots: fc.array(ballot, { minLength: 1, maxLength: 30 }),
      })
    })
    fc.assert(
      fc.property(full, ({ candidates, ballots }) => {
        const prefers = (x: string, y: string) => ballots.filter((b) => b.indexOf(x) < b.indexOf(y)).length
        const loser = candidates.find((x) => candidates.every((y) => y === x || prefers(y, x) > prefers(x, y)))
        if (loser) expect(instantRunoff(candidates, ballots).winner).not.toBe(loser)
      }),
    )
  })

  it('removes exactly one candidate per round until it decides', () => {
    fc.assert(
      fc.property(election, ({ candidates, ballots }) => {
        const { rounds, winner } = instantRunoff(candidates, ballots)
        rounds.forEach((round, i) => {
          expect(Object.keys(round.tallies)).toHaveLength(candidates.length - i)
          const last = i === rounds.length - 1
          expect(round.winner).toBe(last ? winner : null)
          expect(round.eliminated === null).toBe(last)
        })
      }),
    )
  })
})
