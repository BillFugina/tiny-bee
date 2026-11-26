import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '../server/db/client.js'
import { meetupInvite, user } from '../server/db/schema.js'
import { logOnlyEmail, resendEmail, type Email, type EmailSender } from '../server/email/email.js'
import { inviteEmail, signInEmail } from '../server/email/messages.js'
import { meetupChannel, type LiveUpdates } from '../server/live/live.js'
import { INVITES_PER_DAY } from '../server/meetups/invites.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

const KEY = 're_not_a_real_key'
const FROM = 'tiny-bee <noreply@example.com>'
const EMAIL: Email = { to: 'pat@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>', idempotencyKey: 'k1' }

function fakeFetch(...responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  let i = 0
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const respond = responses[Math.min(i++, responses.length - 1)]!
    return respond()
  }) as unknown as typeof fetch
  return { impl, calls }
}

const noSleep = async () => {}

describe('Resend adapter', () => {
  it('posts the email to Resend with the key and an idempotency key', async () => {
    const { impl, calls } = fakeFetch(() => Response.json({ id: 'email-1' }))
    await resendEmail(KEY, FROM, { fetchImpl: impl }).send(EMAIL)
    expect(calls).toHaveLength(1)
    const [call] = calls as [(typeof calls)[number]]
    expect(call.url).toBe('https://api.resend.com/emails')
    expect(call.init.method).toBe('POST')
    const headers = call.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(headers['Idempotency-Key']).toBe('k1')
    expect(JSON.parse(String(call.init.body))).toEqual({
      from: FROM,
      to: ['pat@example.com'],
      subject: 'Hi',
      text: 'Hello',
      html: '<p>Hello</p>',
    })
    // The key goes in the header only.
    expect(String(call.init.body)).not.toContain(KEY)
  })

  it('retries rate limits and server errors with the same idempotency key', async () => {
    const sleeps: number[] = []
    const { impl, calls } = fakeFetch(
      () => new Response('slow down', { status: 429, headers: { 'retry-after': '1' } }),
      () => new Response('oops', { status: 503 }),
      () => Response.json({ id: 'email-1' }),
    )
    await resendEmail(KEY, FROM, { fetchImpl: impl, sleep: async (ms) => void sleeps.push(ms) }).send(EMAIL)
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([1000, 1500])
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key'])
    expect(new Set(keys)).toEqual(new Set(['k1']))
  })

  it('retries network failures, then gives up after three tries', async () => {
    const { impl, calls } = fakeFetch(() => Promise.reject(new Error('network down')))
    await expect(resendEmail(KEY, FROM, { fetchImpl: impl, sleep: noSleep }).send(EMAIL)).rejects.toThrow(
      /Could not reach Resend/,
    )
    expect(calls).toHaveLength(3)
  })

  it('fails at once when Resend refuses the email', async () => {
    const { impl, calls } = fakeFetch(() => new Response('domain not verified', { status: 403 }))
    await expect(resendEmail(KEY, FROM, { fetchImpl: impl, sleep: noSleep }).send(EMAIL)).rejects.toMatchObject({
      status: 403,
    })
    expect(calls).toHaveLength(1)
  })

  it('does not wait out a long Retry-After', async () => {
    const sleep = vi.fn(noSleep)
    const { impl, calls } = fakeFetch(() => new Response('', { status: 429, headers: { 'retry-after': '60' } }))
    await expect(resendEmail(KEY, FROM, { fetchImpl: impl, sleep }).send(EMAIL)).rejects.toMatchObject({ status: 429 })
    expect(calls).toHaveLength(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('only logs when no key is set', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(logOnlyEmail.delivers).toBe(false)
    await logOnlyEmail.send(EMAIL)
    expect(info).toHaveBeenCalledOnce()
    info.mockRestore()
  })
})

describe('email content', () => {
  it('escapes names and titles in the HTML and keeps the link', () => {
    const email = inviteEmail({
      to: 'pat@example.com',
      inviter: 'Ana <script>',
      title: 'Lunch & "games"',
      url: 'https://tiny-bee.example/m/123',
      idempotencyKey: 'invite-1',
    })
    expect(email.subject).toBe('Ana <script> invited you to "Lunch & "games"" on tiny-bee')
    expect(email.html).toContain('Ana &lt;script&gt;')
    expect(email.html).toContain('Lunch &amp; &quot;games&quot;')
    expect(email.html).not.toContain('<script>')
    expect(email.text).toContain('https://tiny-bee.example/m/123')
    expect(email.html).toContain('href="https://tiny-bee.example/m/123"')
  })

  it('clips a very long name in the subject', () => {
    const email = inviteEmail({ to: 'a@b.co', inviter: 'x'.repeat(200), title: 't', url: 'u', idempotencyKey: 'k' })
    expect(email.subject.length).toBeLessThan(120)
  })

  it('says how long a sign-in link lasts', () => {
    const email = signInEmail('pat@example.com', 'https://tiny-bee.example/verify?token=abc', 10)
    expect(email.text).toContain('https://tiny-bee.example/verify?token=abc')
    expect(email.text).toContain('10 minutes')
  })
})

/** Records what would have been emailed. Fails any address listed in `failFor`. */
function recordingEmail(failFor: string[] = []): EmailSender & { sent: Email[] } {
  const sent: Email[] = []
  return {
    sent,
    delivers: true,
    async send(email) {
      if (failFor.includes(email.to)) throw new Error('refused')
      sent.push(email)
    },
  }
}

const url = process.env.DATABASE_URL
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

describe.skipIf(!url)('email invites against Postgres', () => {
  const db = url ? createDb(url) : noDb
  const towns = createTownDirectory(fixtureTowns)
  const createCaller = createCallerFactory(appRouter)
  const origin = 'https://tiny-bee.example'
  const newUser = (name: string): SessionUser => ({
    id: `test-${randomUUID()}`,
    email: `${randomUUID()}@Example.com`,
    name,
  })
  const ana = newUser('Ana')
  const ben = newUser('Ben')
  const stranger = newUser('Stranger')
  const as = (u: SessionUser, email?: EmailSender) => createCaller({ db, user: u, towns, origin, email })

  beforeAll(async () => {
    await db.insert(user).values([ana, ben, stranger].map(({ id, email, name }) => ({ id, email, name })))
  })
  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana.id, ben.id, stranger.id]))
  })

  it('emails the invite link, and skips members and repeat invites', async () => {
    const email = recordingEmail()
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Picnic' })
    await as(ben).meetups.join({ meetupId })
    const first = `${randomUUID()}@example.com`

    const results = await as(ana, email).invites.send({
      meetupId,
      emails: [first, first.toUpperCase(), ben.email.toLowerCase()],
    })
    expect(results).toEqual([
      { email: first, status: 'sent' },
      { email: ben.email.toLowerCase(), status: 'already_member' },
    ])
    expect(email.sent).toHaveLength(1)
    const [sent] = email.sent as [Email]
    expect(sent.to).toBe(first)
    expect(sent.subject).toBe('Ana invited you to "Picnic" on tiny-bee')
    expect(sent.text).toContain(`${origin}/m/${meetupId}`)
    expect(sent.idempotencyKey).toMatch(/^invite-/)

    // Ben can't email the same address about this meetup again today.
    expect(await as(ben, email).invites.send({ meetupId, emails: [first] })).toEqual([
      { email: first, status: 'already_invited' },
    ])
    expect(email.sent).toHaveLength(1)
  })

  it('tells the sign-in page whether email really goes out', async () => {
    const anon = (email?: EmailSender) => createCaller({ db, user: null, towns, origin, email })
    expect(await anon(recordingEmail()).email()).toEqual({ delivers: true })
    expect(await anon(logOnlyEmail).email()).toEqual({ delivers: false })
    expect(await anon().email()).toEqual({ delivers: false })
  })

  it("tells the meetup after invites go out, so other members' lists refresh", async () => {
    const published: string[] = []
    const live: LiveUpdates = {
      publishChange: async (id) => {
        published.push(id)
      },
      subscribeToken: async (id) => ({ host: 'test', channel: meetupChannel(id), token: 't', expires: 0 }),
    }
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Live invites' })
    const caller = (u: SessionUser) => createCaller({ db, user: u, towns, origin, email: recordingEmail(), live })

    await caller(ana).invites.send({ meetupId, emails: [`${randomUUID()}@example.com`] })
    expect(published).toEqual([meetupId])
    await expect(
      caller(stranger).invites.send({ meetupId, emails: [`${randomUUID()}@example.com`] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(published).toEqual([meetupId])
  })

  it('is for members only, and off without a delivering sender', async () => {
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Closed' })
    await expect(
      as(stranger, recordingEmail()).invites.send({ meetupId, emails: ['x@example.com'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(ana).invites.send({ meetupId, emails: ['x@example.com'] })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    await expect(as(ana, logOnlyEmail).invites.send({ meetupId, emails: ['x@example.com'] })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(await as(ana).invites.available()).toEqual({ available: false })
    expect(await as(ana, recordingEmail()).invites.available()).toEqual({ available: true })
  })

  it('lets a failed address be tried again', async () => {
    const bad = `${randomUUID()}@example.com`
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Retry' })
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await as(ana, recordingEmail([bad])).invites.send({ meetupId, emails: [bad] })).toEqual([
      { email: bad, status: 'failed' },
    ])
    expect(await db.select().from(meetupInvite).where(eq(meetupInvite.email, bad))).toEqual([])
    expect(await as(ana, recordingEmail()).invites.send({ meetupId, emails: [bad] })).toEqual([
      { email: bad, status: 'sent' },
    ])
  })

  it('stops at the daily limit', async () => {
    const carl = newUser('Carl')
    await db.insert(user).values({ id: carl.id, email: carl.email, name: carl.name })
    try {
      const email = recordingEmail()
      const { id: meetupId } = await as(carl).meetups.create({ title: 'Big party' })
      const batch = () => Array.from({ length: 10 }, () => `${randomUUID()}@example.com`)
      const statuses: string[] = []
      for (let i = 0; i < 3; i++) {
        const results = await as(carl, email).invites.send({ meetupId, emails: batch() })
        statuses.push(...results.map((r) => r.status))
      }
      expect(statuses.filter((s) => s === 'sent')).toHaveLength(INVITES_PER_DAY)
      expect(statuses.filter((s) => s === 'limit')).toHaveLength(30 - INVITES_PER_DAY)
      expect(email.sent).toHaveLength(INVITES_PER_DAY)
    } finally {
      await db.delete(user).where(eq(user.id, carl.id))
    }
  })

  it('lists sent invites with who joined: all for the organizer, their own for members', async () => {
    const dee = newUser('Dee')
    await db.insert(user).values({ id: dee.id, email: dee.email, name: dee.name })
    try {
      const email = recordingEmail()
      const { id: meetupId } = await as(ana).meetups.create({ title: 'Book club' })
      await as(ben).meetups.join({ meetupId })
      const other = `${randomUUID()}@example.com`
      const bens = `${randomUUID()}@example.com`
      // An invite to `other` from two days ago, before today's resend.
      await db
        .insert(meetupInvite)
        .values({ meetupId, invitedBy: ana.id, email: other, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })
      await as(ana, email).invites.send({ meetupId, emails: [dee.email.toLowerCase(), other] })
      await as(ben, email).invites.send({ meetupId, emails: [bens] })
      await as(dee).meetups.join({ meetupId })

      const forAna = await as(ana).invites.list({ meetupId })
      expect(
        forAna.map(({ email, status, timesSent, invitedBy }) => ({ email, status, timesSent, by: invitedBy.name })),
      ).toEqual([
        { email: bens, status: 'invited', timesSent: 1, by: 'Ben' },
        { email: other, status: 'invited', timesSent: 2, by: 'Ana' },
        { email: dee.email.toLowerCase(), status: 'joined', timesSent: 1, by: 'Ana' },
      ])
      expect((await as(ben).invites.list({ meetupId })).map((i) => i.email)).toEqual([bens])
      await expect(as(stranger).invites.list({ meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    } finally {
      await db.delete(user).where(eq(user.id, dee.id))
    }
  })

  it('rejects bad addresses and too many at once', async () => {
    const { id: meetupId } = await as(ana).meetups.create({ title: 'Checks' })
    const email = recordingEmail()
    await expect(as(ana, email).invites.send({ meetupId, emails: ['not-an-email'] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(
      as(ana, email).invites.send({ meetupId, emails: Array.from({ length: 11 }, (_, i) => `p${i}@example.com`) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(as(ana, email).invites.send({ meetupId, emails: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(email.sent).toHaveLength(0)
  })
})
