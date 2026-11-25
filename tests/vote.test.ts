import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, schema, type Db } from '../server/db/client.js'
import { addItem, removeItem } from '../server/meetups/shortlist.js'
import { openVoting } from '../server/meetups/vote.js'
import { ballot, ballotReceipt, meetup, shortlistItem, user } from '../server/db/schema.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

const createCaller = createCallerFactory(appRouter)
const towns = createTownDirectory(fixtureTowns)

// Runs only when a migrated database is available, like the meetup tests.
const url = process.env.DATABASE_URL
describe.skipIf(!url)('shortlist and vote against Postgres', () => {
  const db = url ? createDb(url) : (undefined as unknown as Db)
  // A second pool, for holding a transaction open while the app's code runs.
  const rawPool = new pg.Pool({ connectionString: url, max: 2 })
  const newUser = (name: string): SessionUser => ({
    id: `test-${randomUUID()}`,
    email: `${randomUUID()}@example.com`,
    name,
  })
  const organizer = newUser('Org')
  const ana = newUser('Ana')
  const ben = newUser('Ben')
  const stranger = newUser('Stranger')
  const everyone = [organizer, ana, ben, stranger]
  const as = (u: SessionUser) => createCaller({ db, user: u, towns })

  beforeAll(async () => {
    await db.insert(user).values(everyone.map(({ id, email, name }) => ({ id, email, name })))
  })

  afterAll(async () => {
    await rawPool.end()
    await db.delete(user).where(
      inArray(
        user.id,
        everyone.map((u) => u.id),
      ),
    )
  })

  /** Puts made-up towns on a shortlist directly, keeping the meetup's count right. */
  async function fillShortlist(meetupId: string, townIds: number[]) {
    await db
      .insert(shortlistItem)
      .values(townIds.map((townId) => ({ meetupId, townId, label: `Town ${townId}`, lat: 35, lng: -80 })))
    await db
      .update(meetup)
      .set({ shortlistCount: sql`${meetup.shortlistCount} + ${townIds.length}` })
      .where(eq(meetup.id, meetupId))
  }

  /**
   * Runs `body` with the app's own code in a transaction on a separate
   * connection, and leaves it uncommitted until `release` is called. That is
   * a request caught mid-flight, so another request can be run against it.
   */
  async function holdTransaction(body: (tx: Db) => Promise<unknown>) {
    const client = await rawPool.connect()
    await client.query('begin')
    await body(drizzle({ client, schema }) as unknown as Db)
    return async () => {
      await client.query('commit')
      client.release()
    }
  }

  /** Whether `promise` is still pending after a short wait, meaning it is blocked on a lock. */
  async function stillWaiting(promise: Promise<unknown>) {
    const pending = Symbol('pending')
    return (await Promise.race([promise.catch(() => null), sleep(300).then(() => pending)])) === pending
  }

  /** A meetup with the organizer, Ana and Ben, and Westford, Midway and Eastford shortlisted. */
  async function meetupWithShortlist() {
    const { id: meetupId } = await as(organizer).meetups.create({ title: 'Vote test' })
    await as(ana).meetups.join({ meetupId })
    await as(ben).meetups.join({ meetupId })
    const westford = await as(organizer).shortlist.add({ meetupId, townId: 1 })
    const midway = await as(ana).shortlist.add({ meetupId, townId: 2, note: 'Good diner' })
    const eastford = await as(ben).shortlist.add({ meetupId, townId: 3 })
    return { meetupId, westford: westford.id, midway: midway.id, eastford: eastford.id }
  }

  it('lets members build a shortlist, with limits on who removes what', async () => {
    const { meetupId, westford, midway } = await meetupWithShortlist()

    const list = await as(ben).shortlist.list({ meetupId })
    expect(list.items.map((i) => i.label)).toEqual(['Westford, NC', 'Midway, NC', 'Eastford, NC'])
    expect(list.items[1]).toMatchObject({ note: 'Good diner', addedBy: 'Ana', canRemove: false })

    await expect(as(ana).shortlist.add({ meetupId, townId: 2 })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(as(ana).shortlist.add({ meetupId, townId: 999 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(as(stranger).shortlist.list({ meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(ben).shortlist.remove({ meetupId, itemId: midway })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await as(organizer).shortlist.remove({ meetupId, itemId: midway })
    await as(organizer).shortlist.remove({ meetupId, itemId: westford })
    expect((await as(ana).shortlist.list({ meetupId })).items.map((i) => i.label)).toEqual(['Eastford, NC'])
  })

  it('caps the shortlist', async () => {
    const { id: meetupId } = await as(organizer).meetups.create({ title: 'Cap test' })
    for (const townId of [1, 2, 3, 4, 5, 6]) await as(organizer).shortlist.add({ meetupId, townId })
    // The fixture has only 7 towns, so fill two slots directly.
    await fillShortlist(meetupId, [98, 99])
    await expect(as(organizer).shortlist.add({ meetupId, townId: 7 })).rejects.toMatchObject({
      message: 'The shortlist holds 8 places at most.',
    })
  })

  it('keeps the cap when places are added at the same time', async () => {
    const { id: meetupId } = await as(organizer).meetups.create({ title: 'Cap race' })
    await fillShortlist(meetupId, [93, 94, 95, 96, 97, 98])
    await Promise.allSettled([1, 2, 3, 4].map((townId) => as(organizer).shortlist.add({ meetupId, townId })))
    expect((await as(organizer).shortlist.list({ meetupId })).items).toHaveLength(8)
  })

  it('makes an add wait for one in flight, then refuses it at the cap', async () => {
    const { id: meetupId } = await as(organizer).meetups.create({ title: 'Cap interleave' })
    await fillShortlist(meetupId, [92, 93, 94, 95, 96, 97, 98])
    const release = await holdTransaction((tx) => addItem(tx, towns, { meetupId, townId: 2 }, organizer.id))
    const late = as(organizer).shortlist.add({ meetupId, townId: 1 })
    expect(await stillWaiting(late)).toBe(true)
    await release()
    await expect(late).rejects.toMatchObject({ message: 'The shortlist holds 8 places at most.' })
    const list = await as(organizer).shortlist.list({ meetupId })
    expect(list.items).toHaveLength(8)
    expect(list.items.at(-1)?.label).toBe('Midway, NC')
  })

  it('makes opening voting wait for a removal in flight, then sees too few places', async () => {
    const { meetupId, midway, eastford } = await meetupWithShortlist()
    await as(organizer).shortlist.remove({ meetupId, itemId: eastford })
    const release = await holdTransaction((tx) => removeItem(tx, { meetupId, itemId: midway }, organizer.id))
    const opening = as(organizer).vote.open({ meetupId, deadline: null })
    expect(await stillWaiting(opening)).toBe(true)
    await release()
    await expect(opening).rejects.toMatchObject({ message: 'Shortlist at least two places before voting.' })
    expect(await as(organizer).vote.status({ meetupId })).toMatchObject({ phase: 'planning' })
  })

  it('makes a shortlist change wait for voting to open, then refuses it', async () => {
    const { meetupId } = await meetupWithShortlist()
    const release = await holdTransaction((tx) => openVoting(tx, { meetupId, deadline: null }, organizer.id))
    const add = as(ana).shortlist.add({ meetupId, townId: 4 })
    expect(await stillWaiting(add)).toBe(true)
    await release()
    await expect(add).rejects.toMatchObject({ message: 'Voting has started, so the shortlist is fixed.' })
    expect((await as(ana).shortlist.list({ meetupId })).items).toHaveLength(3)
  })

  it('never opens voting on a shortlist that changes under it', async () => {
    for (let run = 0; run < 10; run++) {
      const { meetupId, midway } = await meetupWithShortlist()
      await as(organizer).shortlist.remove({
        meetupId,
        itemId: (await as(organizer).shortlist.list({ meetupId })).items[2]!.id,
      })
      // Two places left: removing one while opening must not leave a vote on one place.
      const [removal, opening] = await Promise.allSettled([
        as(ana).shortlist.remove({ meetupId, itemId: midway }),
        as(organizer).vote.open({ meetupId, deadline: null }),
      ])
      const status = await as(organizer).vote.status({ meetupId })
      if (status.phase === 'voting') {
        expect(opening.status).toBe('fulfilled')
        expect(removal.status).toBe('rejected')
        expect(status.candidates).toHaveLength(2)
      } else {
        expect(status.phase).toBe('planning')
        expect(opening.status).toBe('rejected')
      }
    }
  })

  it('opens voting only for the organizer, with two or more places', async () => {
    const { id: meetupId } = await as(organizer).meetups.create({ title: 'Open test' })
    await as(ana).meetups.join({ meetupId })
    await as(organizer).shortlist.add({ meetupId, townId: 1 })

    await expect(as(organizer).vote.open({ meetupId, deadline: null })).rejects.toMatchObject({
      message: 'Shortlist at least two places before voting.',
    })
    await as(ana).shortlist.add({ meetupId, townId: 3 })
    await expect(as(ana).vote.open({ meetupId, deadline: null })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(organizer).vote.open({ meetupId, deadline: new Date(Date.now() - 1000) })).rejects.toMatchObject({
      message: 'Pick a deadline in the future.',
    })
    await expect(
      as(organizer).vote.open({ meetupId, deadline: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await expect(as(ana).vote.cast({ meetupId, ranking: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await as(ana).vote.status({ meetupId })).toMatchObject({ phase: 'planning', canOpen: false })
    expect(await as(organizer).vote.status({ meetupId })).toMatchObject({ phase: 'planning', canOpen: true })

    await as(organizer).vote.open({ meetupId, deadline: null })
    await expect(as(organizer).vote.open({ meetupId, deadline: null })).rejects.toMatchObject({
      message: 'Voting has already started.',
    })
    await expect(as(ana).shortlist.add({ meetupId, townId: 2 })).rejects.toMatchObject({
      message: 'Voting has started, so the shortlist is fixed.',
    })
  })

  it('casts anonymous ballots, lets a voter change theirs, and decides when all have voted', async () => {
    const { meetupId, westford, midway, eastford } = await meetupWithShortlist()
    await expect(as(ana).vote.cast({ meetupId, ranking: [midway] })).rejects.toMatchObject({
      message: 'Voting has not opened yet.',
    })
    await as(organizer).vote.open({ meetupId, deadline: null })

    await expect(as(stranger).vote.cast({ meetupId, ranking: [midway] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(ana).vote.cast({ meetupId, ranking: [randomUUID()] })).rejects.toMatchObject({
      message: 'Rank only places on the shortlist.',
    })

    const anaVote = await as(ana).vote.cast({ meetupId, ranking: [westford, midway] })
    expect(anaVote.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    await expect(as(ana).vote.cast({ meetupId, ranking: [eastford] })).rejects.toMatchObject({ code: 'CONFLICT' })

    // Ana changes her mind with her token; still one ballot, one receipt.
    await as(ana).vote.cast({ meetupId, ranking: [midway, westford], token: anaVote.token })
    expect(await as(ana).vote.mine({ meetupId, token: anaVote.token })).toEqual({ ranking: [midway, westford] })
    await expect(as(ben).vote.cast({ meetupId, ranking: [eastford], token: 'x'.repeat(32) })).rejects.toMatchObject({
      message: 'That ballot token does not match a ballot here.',
    })

    const midVote = await as(ben).vote.status({ meetupId })
    expect(midVote).toMatchObject({ phase: 'voting', iVoted: false, turnout: { voted: 1, members: 3 }, result: null })
    expect(await as(ana).vote.status({ meetupId })).toMatchObject({ iVoted: true })

    // Ballots carry no member and no time.
    const stored = await db.select().from(ballot).where(eq(ballot.meetupId, meetupId))
    expect(stored).toHaveLength(1)
    expect(Object.keys(stored[0]!).sort()).toEqual(['id', 'meetupId', 'ranking', 'tokenHash'])
    expect(stored[0]!.tokenHash).not.toBe(anaVote.token)

    await as(ben).vote.cast({ meetupId, ranking: [eastford, midway] })
    // The last ballot closes the vote.
    await as(organizer).vote.cast({ meetupId, ranking: [westford, eastford] })

    const decided = await as(ben).vote.status({ meetupId })
    expect(decided.phase).toBe('decided')
    expect(decided.turnout).toEqual({ voted: 3, members: 3 })
    // A three-way tie in round 1; Eastford, added last, goes, and Ben's vote moves to Midway.
    expect(decided.result?.winner?.label).toBe('Midway, NC')
    expect(decided.result!.rounds.length).toBeGreaterThan(0)

    await expect(as(ana).vote.cast({ meetupId, ranking: [eastford], token: anaVote.token })).rejects.toMatchObject({
      message: 'Voting has closed.',
    })
    const receipts = await db.select().from(ballotReceipt).where(eq(ballotReceipt.meetupId, meetupId))
    expect(receipts).toHaveLength(3)
  })

  it('counts the vote correctly round by round', async () => {
    const { meetupId, westford, midway, eastford } = await meetupWithShortlist()
    await as(organizer).vote.open({ meetupId, deadline: null })
    await as(organizer).vote.cast({ meetupId, ranking: [westford, midway] })
    await as(ana).vote.cast({ meetupId, ranking: [midway] })
    await as(ben).vote.cast({ meetupId, ranking: [eastford, midway] })

    const { result } = await as(ana).vote.status({ meetupId })
    // Round 1 is a three-way tie at one each; Eastford, added last, goes first.
    // Round 2: Westford 1, Midway 2, so Midway wins.
    expect(result?.winner).toEqual({ id: midway, label: 'Midway, NC' })
    expect(result?.rounds[0]).toMatchObject({
      number: 1,
      eliminated: 'Eastford, NC',
      reason: 'tie-broken-by-list-order',
    })
    expect(result?.rounds.at(-1)).toMatchObject({ winner: 'Midway, NC', reason: 'majority' })
  })

  it('lets the organizer close early, and closes by itself after the deadline', async () => {
    const first = await meetupWithShortlist()
    await as(organizer).vote.open({ meetupId: first.meetupId, deadline: null })
    await as(ana).vote.cast({ meetupId: first.meetupId, ranking: [first.midway] })
    await expect(as(ana).vote.close({ meetupId: first.meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await as(organizer).vote.close({ meetupId: first.meetupId })
    const closed = await as(ben).vote.status({ meetupId: first.meetupId })
    expect(closed).toMatchObject({ phase: 'decided', turnout: { voted: 1, members: 3 } })
    expect(closed.result?.winner?.label).toBe('Midway, NC')
    await expect(as(organizer).vote.close({ meetupId: first.meetupId })).rejects.toMatchObject({
      message: 'Voting is not open.',
    })

    const second = await meetupWithShortlist()
    await as(organizer).vote.open({ meetupId: second.meetupId, deadline: new Date(Date.now() + 60_000) })
    await as(ana).vote.cast({ meetupId: second.meetupId, ranking: [second.eastford] })
    // Move the deadline into the past, as if time had passed.
    await db
      .update(meetup)
      .set({ votingDeadline: new Date(Date.now() - 1000) })
      .where(eq(meetup.id, second.meetupId))
    await expect(as(ben).vote.cast({ meetupId: second.meetupId, ranking: [second.midway] })).rejects.toMatchObject({
      message: 'Voting has closed.',
    })
    const late = await as(ben).vote.status({ meetupId: second.meetupId })
    expect(late).toMatchObject({ phase: 'decided' })
    expect(late.result?.winner?.label).toBe('Eastford, NC')
  })
})
