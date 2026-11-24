import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '../server/db/client.js'
import { user } from '../server/db/schema.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'

const createCaller = createCallerFactory(appRouter)
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

describe('public procedures', () => {
  it('health answers without a session or database', async () => {
    const result = await createCaller({ db: noDb, user: null }).health()
    expect(result.ok).toBe(true)
  })

  it('me is null when signed out', async () => {
    expect(await createCaller({ db: noDb, user: null }).me()).toBeNull()
  })
})

describe('protected procedures', () => {
  it('reject callers without a session', async () => {
    await expect(createCaller({ db: noDb, user: null }).meetups.listMine()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('validate input before touching the database', async () => {
    const caller = createCaller({ db: noDb, user: { id: 'u', email: 'u@example.com', name: 'U' } })
    await expect(caller.meetups.create({ title: 'x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

// Runs only when a migrated database is available (CI provides one; locally,
// set DATABASE_URL to a disposable database and run `npm run db:migrate`).
const url = process.env.DATABASE_URL
describe.skipIf(!url)('meetups against Postgres', () => {
  const db = url ? createDb(url) : noDb
  const me: SessionUser = { id: `test-${randomUUID()}`, email: `${randomUUID()}@example.com`, name: 'Tester' }

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, me.id))
  })

  it('creates a meetup and lists it with the organizer role', async () => {
    await db.insert(user).values({ id: me.id, email: me.email, name: me.name })
    const caller = createCaller({ db, user: me })

    const created = await caller.meetups.create({ title: '  Saturday brunch  ' })
    expect(created.title).toBe('Saturday brunch')

    const mine = await caller.meetups.listMine()
    expect(mine).toEqual([expect.objectContaining({ id: created.id, title: 'Saturday brunch', role: 'organizer' })])
  })
})
