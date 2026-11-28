import { randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '../server/db/client.js'
import { user } from '../server/db/schema.js'
import {
  ablyLiveUpdates,
  afterResponse,
  meetupChannel,
  noLiveUpdates,
  SERVER_CLIENT_ID,
  type LiveUpdates,
} from '../server/live/live.js'
import { createMcpServer } from '../server/mcp/server.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

const KEY = 'appId.keyId:not-a-real-secret'
const MEETUP = '0b8f2a4e-6c1d-4e5f-9a7b-3c2d1e0f9a8b'

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('Ably adapter', () => {
  it('publishes a bare "changed" message to the meetup channel with the key', async () => {
    const { impl, calls } = fakeFetch(() => new Response('{}', { status: 201 }))
    await ablyLiveUpdates(KEY, impl).publishChange(MEETUP)
    expect(calls).toHaveLength(1)
    const [call] = calls as [(typeof calls)[number]]
    expect(call.url).toBe(`https://main.realtime.ably.net/channels/meetup%3A${MEETUP}/messages`)
    expect(call.init.method).toBe('POST')
    const headers = call.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(KEY).toString('base64')}`)
    // Identified, so channels that require identified clients accept it (Ably error 40161).
    expect(Buffer.from(headers['X-Ably-ClientId'] ?? '', 'base64').toString()).toBe(SERVER_CLIENT_ID)
    // No meetup data ever goes through Ably.
    expect(JSON.parse(String(call.init.body))).toEqual({ name: 'changed', clientId: SERVER_CLIENT_ID })
  })

  it('never throws when publishing fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = fakeFetch(() => Promise.reject(new Error('network down')))
    await expect(ablyLiveUpdates(KEY, down.impl).publishChange(MEETUP)).resolves.toBeUndefined()
    const refused = fakeFetch(() => new Response('nope', { status: 401 }))
    await expect(ablyLiveUpdates(KEY, refused.impl).publishChange(MEETUP)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('asks for a subscribe-only token for just that meetup, naming the member', async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json({ token: 'tok', expires: 1_900_000_000_000, keyName: 'appId.keyId' }),
    )
    const token = await ablyLiveUpdates(KEY, impl).subscribeToken(MEETUP, 'user-1')
    expect(token).toEqual({
      host: 'main.realtime.ably.net',
      channel: meetupChannel(MEETUP),
      token: 'tok',
      expires: 1_900_000_000_000,
    })
    const [call] = calls as [(typeof calls)[number]]
    expect(call.url).toBe('https://main.realtime.ably.net/keys/appId.keyId/requestToken')
    const body = JSON.parse(String(call.init.body))
    expect(body.keyName).toBe('appId.keyId')
    expect(body.ttl).toBe(60 * 60 * 1000)
    expect(body.clientId).toBe('user-1')
    expect(JSON.parse(body.capability)).toEqual({ [`meetup:${MEETUP}`]: ['subscribe'] })
    // The secret half of the key never goes in a request body.
    expect(String(call.init.body)).not.toContain('not-a-real-secret')
  })

  it('returns no token when Ably refuses', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { impl } = fakeFetch(() => new Response('bad key', { status: 401 }))
    expect(await ablyLiveUpdates(KEY, impl).subscribeToken(MEETUP, 'user-1')).toBeNull()
    error.mockRestore()
  })

  it('rejects a key without a secret, and does nothing when off', async () => {
    expect(() => ablyLiveUpdates('appId.keyId')).toThrow()
    await expect(noLiveUpdates.publishChange(MEETUP)).resolves.toBeUndefined()
    expect(await noLiveUpdates.subscribeToken(MEETUP, 'user-1')).toBeNull()
  })
})

/** Records what would have gone to Ably. */
function recordingLive(): LiveUpdates & { published: string[]; tokensFor: string[] } {
  const published: string[] = []
  const tokensFor: string[] = []
  return {
    published,
    tokensFor,
    publishChange: async (meetupId) => {
      published.push(meetupId)
    },
    subscribeToken: async (meetupId, clientId) => {
      tokensFor.push(clientId)
      return { host: 'test', channel: meetupChannel(meetupId), token: 't', expires: 0 }
    },
  }
}

const url = process.env.DATABASE_URL
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

describe.skipIf(!url)('live updates against Postgres', () => {
  const db = url ? createDb(url) : noDb
  const towns = createTownDirectory(fixtureTowns)
  const createCaller = createCallerFactory(appRouter)
  const newUser = (name: string): SessionUser => ({
    id: `test-${randomUUID()}`,
    email: `${randomUUID()}@example.com`,
    name,
  })
  const ana = newUser('Ana')
  const ben = newUser('Ben')
  const stranger = newUser('Stranger')

  beforeAll(async () => {
    await db.insert(user).values([ana, ben, stranger].map(({ id, email, name }) => ({ id, email, name })))
  })
  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana.id, ben.id, stranger.id]))
  })

  it('tells the meetup after a change succeeds, and not after reads or failures', async () => {
    const live = recordingLive()
    const as = (u: SessionUser) => createCaller({ db, user: u, towns, live })
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Live test' })
    expect(live.published).toEqual([]) // nobody is listening yet

    await as(ben).meetups.join({ meetupId })
    await as(ben).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 60 })
    expect(live.published).toEqual([meetupId, meetupId])

    await as(ben).meetups.get({ meetupId })
    await expect(as(stranger).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 60 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(live.published).toHaveLength(2)
  })

  it('gives tokens to members only, and none when live updates are off', async () => {
    const live = recordingLive()
    const { id: meetupId } = await createCaller({ db, user: ana, towns, live }).meetups.create({ title: 'Tokens' })
    expect(await createCaller({ db, user: ana, towns, live }).live.token({ meetupId })).toMatchObject({
      channel: `meetup:${meetupId}`,
    })
    expect(live.tokensFor).toEqual([ana.id])
    await expect(createCaller({ db, user: stranger, towns, live }).live.token({ meetupId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await createCaller({ db, user: ana, towns }).live.token({ meetupId })).toBeNull()
  })

  it('tells the meetup when an agent joins over MCP, and not when it reads', async () => {
    const live = recordingLive()
    const { id: meetupId } = await createCaller({ db, user: ana, towns }).meetups.create({ title: 'Agent live' })
    const server = createMcpServer({ db, towns, userId: ben.id, origin: 'http://localhost:5173', live })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-agent', version: '1.0.0' })
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const call = async (name: string, args: Record<string, unknown>) =>
      (await client.callTool({ name, arguments: args })) as CallToolResult

    expect((await call('join_meetup', { invite: meetupId })).isError).not.toBe(true)
    expect(live.published).toEqual([meetupId])
    expect((await call('get_meetup', { meetupId })).isError).not.toBe(true)
    expect(live.published).toEqual([meetupId])
  })
})

describe('afterResponse', () => {
  const key = Symbol.for('@vercel/request-context')
  const globals = globalThis as Record<symbol, unknown>

  it('hands the publish to Vercel waitUntil so the response does not wait', async () => {
    const handed: Promise<unknown>[] = []
    globals[key] = { get: () => ({ waitUntil: (p: Promise<unknown>) => handed.push(p) }) }
    try {
      let finish!: () => void
      const slow = new Promise<void>((resolve) => (finish = resolve))
      await afterResponse(slow) // resolves without waiting for the slow publish
      expect(handed).toEqual([slow])
      finish()
    } finally {
      delete globals[key]
    }
  })

  it('waits for the publish when not on Vercel', async () => {
    let done = false
    await afterResponse(Promise.resolve().then(() => void (done = true)))
    expect(done).toBe(true)
  })
})
