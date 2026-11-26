import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '../server/db/client.js'
import { meetup, shortlistItem, user } from '../server/db/schema.js'
import { createMcpServer, meetupIdFromLink } from '../server/mcp/server.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

const towns = createTownDirectory(fixtureTowns)
const createCaller = createCallerFactory(appRouter)
const ORIGIN = 'http://localhost:5173'

const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

// Tool results are JSON the tests pick apart freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

/** An MCP client talking to a server that acts as `userId`, in memory. */
async function connect(db: Db, userId: string) {
  const server = createMcpServer({ db, towns, userId, origin: ORIGIN })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-agent', version: '1.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return {
    client,
    async call(name: string, args: Record<string, unknown> = {}) {
      const result = (await client.callTool({ name, arguments: args })) as CallToolResult
      const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
      return { isError: result.isError === true, text, data: (result.isError ? {} : JSON.parse(text)) as Json }
    },
  }
}

describe('meetupIdFromLink', () => {
  const id = '0b8f2a4e-6c1d-4e5f-9a7b-3c2d1e0f9a8b'
  it('reads the id from an invite link or a bare id', () => {
    expect(meetupIdFromLink(`https://tiny-bee.billfugina.com/m/${id}`)).toBe(id)
    expect(meetupIdFromLink(`/m/${id.toUpperCase()}?x=1`)).toBe(id)
    expect(meetupIdFromLink(`  ${id} `)).toBe(id)
  })
  it('rejects anything else', () => {
    expect(meetupIdFromLink('https://example.com/')).toBeNull()
    expect(meetupIdFromLink(`https://example.com/x${id}`)).toBeNull()
    expect(meetupIdFromLink(`${id}0`)).toBeNull()
  })
})

describe('MCP tool list', () => {
  it('offers the planner tools plus meetup and ballot tools, each scoped by meetupId', async () => {
    const { client } = await connect(noDb, 'nobody')
    const { tools } = await client.listTools()
    const byName = new Map(tools.map((t) => [t.name, t]))
    for (const name of [
      'list_my_meetups',
      'create_meetup',
      'join_meetup',
      'get_meetup',
      'get_shortlist',
      'cast_ballot',
    ]) {
      expect(byName.has(name)).toBe(true)
    }
    const unscoped = new Set(['list_my_meetups', 'create_meetup', 'join_meetup', 'search_towns'])
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(10)
      if (!unscoped.has(t.name)) expect(t.inputSchema.required).toContain('meetupId')
    }
    expect(byName.get('get_shortlist')?.annotations?.readOnlyHint).toBe(true)
    expect(byName.get('cast_ballot')?.inputSchema.required).toContain('memberConfirmed')
  })

  it("won't cast a ballot the member hasn't confirmed", async () => {
    const { call } = await connect(noDb, 'nobody')
    const meetupId = randomUUID()
    const ranking = [randomUUID()]
    for (const args of [
      { meetupId, ranking },
      { meetupId, ranking, memberConfirmed: false },
    ]) {
      const r = await call('cast_ballot', args)
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(/memberConfirmed/)
    }
  })

  it('refuses a join without an invite link', async () => {
    const { call } = await connect(noDb, 'nobody')
    expect(await call('join_meetup', { invite: 'https://example.com/' })).toMatchObject({ isError: true })
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)('MCP tools against Postgres', () => {
  const db = url ? createDb(url) : noDb
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

  it('creates, shares and joins a meetup as the member the token names', async () => {
    const asAna = await connect(db, ana.id)
    const created = await asAna.call('create_meetup', { title: 'Agent meetup' })
    expect(created.isError).toBe(false)
    const meetupId = created.data.meetupId as string

    const invite = await asAna.call('get_invite_link', { meetupId })
    const link = JSON.stringify(invite.data).match(/https?:\/\/[^"]+\/m\/[0-9a-f-]+/)?.[0]
    expect(link).toContain(meetupId)

    const asBen = await connect(db, ben.id)
    expect(await asBen.call('join_meetup', { invite: link })).toMatchObject({ isError: false })
    const mine = await asBen.call('list_my_meetups')
    expect(mine.data.meetups).toContainEqual({ meetupId, title: 'Agent meetup', role: 'member' })

    const seen = await asBen.call('get_meetup', { meetupId })
    expect(seen.data.title).toBe('Agent meetup')

    // Someone who isn't in it gets nothing, whatever meetupId their agent sends.
    const asStranger = await connect(db, stranger.id)
    expect(await asStranger.call('get_meetup', { meetupId })).toMatchObject({ isError: true })
    expect(await asStranger.call('get_shortlist', { meetupId })).toMatchObject({ isError: true })
    expect(await asStranger.call('list_my_meetups')).toMatchObject({ data: { meetups: [] } })
  })

  it('casts and changes a confirmed ballot, and keeps one ballot per member', async () => {
    const { id: meetupId } = await createCaller({ db, user: ana, towns }).meetups.create({ title: 'Agent vote' })
    await createCaller({ db, user: ben, towns }).meetups.join({ meetupId })
    const items = await db
      .insert(shortlistItem)
      .values([1, 2].map((n) => ({ meetupId, townId: 900000 + n, label: `Town ${n}`, lat: 35, lng: -80 })))
      .returning({ id: shortlistItem.id })
    await db
      .update(meetup)
      .set({ shortlistCount: sql`${meetup.shortlistCount} + 2` })
      .where(eq(meetup.id, meetupId))

    const asBen = await connect(db, ben.id)
    const shortlist = await asBen.call('get_shortlist', { meetupId })
    const itemIds = (shortlist.data.items as { itemId: string }[]).map((i) => i.itemId)
    expect(itemIds.sort()).toEqual(items.map((i) => i.id).sort())

    expect(await asBen.call('cast_ballot', { meetupId, ranking: itemIds, memberConfirmed: true })).toMatchObject({
      isError: true,
    }) // voting isn't open yet

    await createCaller({ db, user: ana, towns }).vote.open({ meetupId, deadline: null })
    const cast = await asBen.call('cast_ballot', { meetupId, ranking: itemIds, memberConfirmed: true })
    expect(cast.isError).toBe(false)
    expect(cast.data).toMatchObject({ changed: false, ranked: 2 })

    const again = await asBen.call('cast_ballot', { meetupId, ranking: itemIds, memberConfirmed: true })
    expect(again.isError).toBe(true)
    expect(again.text).toMatch(/ballotToken/)

    const changed = await asBen.call('cast_ballot', {
      meetupId,
      ranking: [...itemIds].reverse(),
      ballotToken: cast.data.ballotToken,
      memberConfirmed: true,
    })
    expect(changed.data).toMatchObject({ changed: true })
  })
})

describe.skipIf(!url)('MCP over HTTP with OAuth', () => {
  // Same flow an MCP client follows: discover, register, send the member through
  // sign-in and consent, swap the code for a token, call /api/mcp with it.
  let handlers: typeof import('../server/handlers.js')
  let cookie = ''
  const email = `${randomUUID()}@example.com`

  beforeAll(async () => {
    // Fixed, because the JWT plugin encrypts its signing key with the secret and
    // keeps it in the database between runs.
    vi.stubEnv('BETTER_AUTH_SECRET', 'tiny-bee-test-secret-for-the-mcp-oauth-flow')
    vi.stubEnv('BETTER_AUTH_URL', ORIGIN)
    handlers = await import('../server/handlers.js')
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    if (url) await createDb(url).delete(user).where(eq(user.email, email))
  })

  const auth = (path: string, init: RequestInit = {}) =>
    handlers.handleAuth(
      new Request(`${ORIGIN}${path}`, {
        ...init,
        headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string>) },
      }),
    )
  const mcp = (body: unknown, token?: string) =>
    handlers.handleMcp(
      new Request(`${ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    )
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  }

  it('asks for a token, and says where to get one', async () => {
    const res = await mcp(initialize)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)

    const meta = await auth('/.well-known/oauth-protected-resource/api/mcp')
    expect(meta.status).toBe(200)
    const doc = (await meta.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] }
    expect(doc.resource).toBe(`${ORIGIN}/api/mcp`)
    expect(doc.scopes_supported).toEqual(['meetups'])

    const issuer = new URL(doc.authorization_servers[0]!)
    const as = await auth(`/.well-known/oauth-authorization-server${issuer.pathname}`)
    expect(as.status).toBe(200)
    expect(await as.json()).toMatchObject({ registration_endpoint: expect.stringContaining('/oauth2/register') })
  })

  it('refuses a plain-http redirect that is not on this machine', async () => {
    const reg = await auth('/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'], token_endpoint_auth_method: 'none' }),
    })
    expect(reg.status).toBe(400)
  })

  it('connects an agent once the member signs in and allows it', async () => {
    const redirectUri = 'http://127.0.0.1:33418/callback'
    const reg = await auth('/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test agent',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
      }),
    })
    expect(reg.status).toBeLessThan(300)
    const { client_id: clientId } = (await reg.json()) as { client_id: string }

    const signUp = await auth('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Agent Owner', email, password: 'correct horse battery' }),
    })
    expect(signUp.status).toBe(200)
    cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'meetups offline_access',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: `${ORIGIN}/api/mcp`,
    })
    const authorize = await auth(`/api/auth/oauth2/authorize?${query}`)
    const consentUrl = new URL(authorize.headers.get('location') ?? '', ORIGIN)
    expect(consentUrl.pathname).toBe('/consent')

    const consent = await auth('/api/auth/oauth2/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
    })
    expect(consent.status).toBe(200)
    const { url: back } = (await consent.json()) as { url: string }
    const code = new URL(back).searchParams.get('code')
    expect(code).toBeTruthy()

    cookie = '' // the agent has no browser session
    const tokenRes = await auth('/api/auth/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${ORIGIN}/api/mcp`,
      }),
    })
    expect(tokenRes.status).toBe(200)
    const { access_token: token } = (await tokenRes.json()) as { access_token: string }

    const init = await mcp(initialize, token)
    expect(init.status).toBe(200)
    expect(await init.json()).toMatchObject({ result: { serverInfo: { name: 'tiny-bee' } } })

    const created = await mcp(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'create_meetup', arguments: { title: 'Via OAuth' } },
      },
      token,
    )
    const body = (await created.json()) as { result: CallToolResult }
    expect(body.result.isError).toBeFalsy()

    // A token for this endpoint with a tampered signature gets nothing.
    expect((await mcp(initialize, `${token.slice(0, -4)}AAAA`)).status).toBe(401)
  })
})
