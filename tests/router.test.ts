import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '../server/db/client.js'
import { meetupMember, user } from '../server/db/schema.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

const createCaller = createCallerFactory(appRouter)
const towns = createTownDirectory(fixtureTowns)
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

describe('public procedures', () => {
  it('health reports configuration without throwing', async () => {
    const result = await createCaller({ db: noDb, user: null, towns }).health()
    expect(result.checks).toEqual({
      authSecret: (process.env.BETTER_AUTH_SECRET ?? '').length >= 32,
      database: expect.any(String),
    })
  })

  it('me is null when signed out', async () => {
    expect(await createCaller({ db: noDb, user: null, towns }).me()).toBeNull()
  })
})

describe('protected procedures', () => {
  it('reject callers without a session', async () => {
    await expect(createCaller({ db: noDb, user: null, towns }).meetups.listMine()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('validate input before touching the database', async () => {
    const caller = createCaller({ db: noDb, user: { id: 'u', email: 'u@example.com', name: 'U' }, towns })
    await expect(caller.meetups.create({ title: 'x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(caller.meetups.get({ meetupId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(caller.meetups.setMyStart({ meetupId: randomUUID(), townId: 1, maxMinutes: 5 })).rejects.toMatchObject(
      { code: 'BAD_REQUEST' },
    )
    await expect(caller.places.search({ q: 'w' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('search towns without touching the database', async () => {
    const caller = createCaller({ db: noDb, user: { id: 'u', email: 'u@example.com', name: 'U' }, towns })
    expect(await caller.places.search({ q: 'westford, ma' })).toEqual([{ id: 5, label: 'Westford, MA' }])
  })
})

// Runs only when a migrated database is available (CI provides one; locally,
// set DATABASE_URL to a disposable database and run `npm run db:migrate`).
const url = process.env.DATABASE_URL
describe.skipIf(!url)('meetups against Postgres', () => {
  const db = url ? createDb(url) : noDb
  const newUser = (name: string): SessionUser => ({
    id: `test-${randomUUID()}`,
    email: `${randomUUID()}@example.com`,
    name,
  })
  const me = newUser('Tester')
  const friend = newUser('Friend')
  const stranger = newUser('Stranger')
  const as = (u: SessionUser) => createCaller({ db, user: u, towns })

  beforeAll(async () => {
    await db.insert(user).values([me, friend, stranger].map(({ id, email, name }) => ({ id, email, name })))
  })

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [me.id, friend.id, stranger.id]))
  })

  it('creates a meetup and lists it with the organizer role', async () => {
    const created = await as(me).meetups.create({ title: '  Saturday brunch  ' })
    expect(created.title).toBe('Saturday brunch')

    const mine = await as(me).meetups.listMine()
    expect(mine).toEqual([
      expect.objectContaining({
        id: created.id,
        title: 'Saturday brunch',
        role: 'organizer',
        phase: 'planning',
        memberCount: 1,
      }),
    ])
  })

  it('lets someone with the link join, set a start and see fair areas', async () => {
    const { id: meetupId } = await as(me).meetups.create({ title: 'Halfway lunch' })

    const preview = await as(friend).meetups.preview({ meetupId })
    expect(preview).toMatchObject({ title: 'Halfway lunch', organizer: 'Tester', memberCount: 1, isMember: false })
    await expect(as(friend).meetups.get({ meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await as(friend).meetups.join({ meetupId })
    await as(friend).meetups.join({ meetupId }) // joining twice is harmless
    expect((await as(friend).meetups.preview({ meetupId })).memberCount).toBe(2)

    const waiting = await as(me).meetups.fairAreas({ meetupId })
    expect(waiting).toMatchObject({ ready: 0, waitingOn: ['Tester', 'Friend'], areas: [] })

    await as(me).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 90 })
    await as(friend).meetups.setMyStart({ meetupId, townId: 3, maxMinutes: 90 })

    const page = await as(friend).meetups.get({ meetupId })
    expect(page.members).toEqual([
      expect.objectContaining({
        name: 'Tester',
        role: 'organizer',
        isMe: false,
        maxMinutes: 90,
        start: { townId: 1, label: 'Westford, NC' },
      }),
      expect.objectContaining({
        name: 'Friend',
        role: 'member',
        isMe: true,
        maxMinutes: 90,
        start: { townId: 3, label: 'Eastford, NC' },
      }),
    ])

    const fair = await as(me).meetups.fairAreas({ meetupId })
    expect(fair).toMatchObject({ estimated: true, ready: 2, waitingOn: [] })
    expect(fair.areas.length).toBeGreaterThan(0)
    // Halfway between the two, Midway (or the computed midpoint) is fairest.
    expect(['Midway, NC', 'Midpoint']).toContain(fair.areas[0]!.name)
    for (const area of fair.areas) {
      expect(area.times.map((t) => t.name).sort()).toEqual(['Friend', 'Tester'])
      expect(area.longest).toBeLessThanOrEqual(90)
    }
    for (let i = 1; i < fair.areas.length; i++) {
      expect(fair.areas[i]!.longest).toBeGreaterThanOrEqual(fair.areas[i - 1]!.longest)
    }
  })

  it('offers the closest misses when nowhere fits everyone', async () => {
    const { id: meetupId } = await as(me).meetups.create({ title: 'Too far apart' })
    await as(friend).meetups.join({ meetupId })
    await as(me).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 15 })
    await as(friend).meetups.setMyStart({ meetupId, townId: 3, maxMinutes: 15 })

    const fair = await as(friend).meetups.fairAreas({ meetupId })
    expect(fair.areas).toEqual([])
    expect(fair.closestMisses.length).toBeGreaterThan(0)
    expect(fair.closestMisses[0]!.overLimitCount).toBeGreaterThan(0)
  })

  it('keeps non-members out and rejects unknown towns', async () => {
    const { id: meetupId } = await as(me).meetups.create({ title: 'Members only' })
    await expect(as(stranger).meetups.fairAreas({ meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(stranger).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 60 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(as(me).meetups.setMyStart({ meetupId, townId: 999, maxMinutes: 60 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(as(stranger).meetups.preview({ meetupId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(as(stranger).meetups.join({ meetupId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a half-written start at the database', async () => {
    const { id: meetupId } = await as(me).meetups.create({ title: 'Constraint check' })
    const mine = and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, me.id))
    await expect(db.update(meetupMember).set({ startTownId: 1, maxMinutes: 60 }).where(mine)).rejects.toThrow()

    await as(me).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 60 })
    await expect(db.update(meetupMember).set({ startLat: null }).where(mine)).rejects.toThrow()
    await db
      .update(meetupMember)
      .set({ startTownId: null, startLabel: null, startLat: null, startLng: null, maxMinutes: null })
      .where(mine)
  })
})
