import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PLANNER, echoable } from '../server/agent/checkin.js'
import type { ModelRequest, ModelResponse, PlannerModel } from '../server/agent/model.js'
import { plannerToolDefinitions, runPlannerTool } from '../server/agent/tools.js'
import { createDb, type Db } from '../server/db/client.js'
import { checkinMessage, meetupMember, user } from '../server/db/schema.js'
import { createTownDirectory } from '../server/places/directory.js'
import { appRouter } from '../server/routers/index.js'
import { createCallerFactory, type SessionUser } from '../server/trpc.js'
import { fixtureTowns } from './fixtures/towns.js'

type Block = ModelResponse['content'][number]

const createCaller = createCallerFactory(appRouter)
const towns = createTownDirectory(fixtureTowns)

const reply = (stop_reason: ModelResponse['stop_reason'], content: unknown[]): ModelResponse =>
  ({
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: DEFAULT_PLANNER.model,
    content: content as Block[],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as unknown as ModelResponse

const thinking = (text: string) => ({ type: 'thinking', thinking: text, signature: `sig-${text}` })
const text = (t: string) => ({ type: 'text', text: t, citations: null })
const call = (name: string, input: unknown) => ({ type: 'tool_use', id: `toolu_${randomUUID()}`, name, input })

/** A planner that plays back scripted replies and keeps a copy of every request. */
function scripted(...replies: (ModelResponse | (() => never))[]) {
  const requests: ModelRequest[] = []
  const model: PlannerModel = {
    async create(request) {
      requests.push(structuredClone(request))
      const next = replies.shift()
      if (!next) throw new Error('the planner was called more times than the test expected')
      return typeof next === 'function' ? next() : next
    },
  }
  return { model, requests, planner: { model, config: DEFAULT_PLANNER } }
}

describe('planner tool definitions', () => {
  it('send plain JSON schemas without a $schema key', () => {
    expect(plannerToolDefinitions.map((t) => t.name)).not.toContain('cast_ballot')
    for (const def of plannerToolDefinitions) {
      expect(def.input_schema.type).toBe('object')
      expect(def.input_schema).not.toHaveProperty('$schema')
      expect(def.description?.length).toBeGreaterThan(10)
    }
  })

  it('leaves no tool that touches a ballot', () => {
    for (const def of plannerToolDefinitions) expect(def.name).not.toMatch(/ballot|vote_for|cast|open_vote|close/)
  })
})

describe('echoable', () => {
  it('keeps a reply with no fallback as it is', () => {
    const content = [thinking('a'), text('hi')] as Block[]
    expect(echoable(content)).toBe(content)
  })

  it('drops thinking and tool calls from before the last fallback', () => {
    const content = [
      thinking('first model'),
      call('get_meetup', {}),
      text('partial'),
      { type: 'fallback' },
      thinking('second model'),
      text('done'),
    ] as Block[]
    expect(echoable(content).map((b) => b.type)).toEqual(['text', 'fallback', 'thinking', 'text'])
  })
})

const url = process.env.DATABASE_URL
const noDb = new Proxy({} as Db, {
  get() {
    throw new Error('this test should not touch the database')
  },
})

describe.skipIf(!url)('check-in against Postgres', () => {
  const db = url ? createDb(url) : noDb
  const newUser = (name: string): SessionUser => ({
    id: `test-${randomUUID()}`,
    email: `${randomUUID()}@example.com`,
    name,
  })
  const ana = newUser('Ana')
  const ben = newUser('Ben')
  const stranger = newUser('Stranger')
  const as = (u: SessionUser, planner: ReturnType<typeof scripted>['planner'] | null = null) =>
    createCaller({ db, user: u, towns, planner })

  async function newMeetup(title: string) {
    const { id: meetupId } = await as(ana).meetups.create({ title })
    await as(ben).meetups.join({ meetupId })
    return meetupId
  }

  const busy = async (meetupId: string, u: SessionUser) => {
    const [row] = await db
      .select({ busy: meetupMember.checkinBusySince })
      .from(meetupMember)
      .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, u.id)))
    return row?.busy ?? null
  }

  beforeAll(async () => {
    await db.insert(user).values([ana, ben, stranger].map(({ id, email, name }) => ({ id, email, name })))
  })

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ana.id, ben.id, stranger.id]))
  })

  it('says the planner is off when no key is set', async () => {
    const meetupId = await newMeetup('No key')
    expect(await as(ana).checkin.history({ meetupId })).toEqual({ enabled: false, messages: [] })
    await expect(as(ana).checkin.send({ meetupId, text: 'hi' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(await busy(meetupId, ana)).toBeNull()
  })

  it('keeps people outside the meetup out', async () => {
    const meetupId = await newMeetup('Members only')
    const { planner } = scripted()
    await expect(as(stranger, planner).checkin.history({ meetupId })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(as(stranger, planner).checkin.send({ meetupId, text: 'hi' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects an empty message before calling the planner', async () => {
    const meetupId = await newMeetup('Empty')
    const { planner, requests } = scripted()
    await expect(as(ana, planner).checkin.send({ meetupId, text: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(requests).toHaveLength(0)
  })

  it('runs a turn with tools, saves the start, and replays the same conversation next time', async () => {
    const meetupId = await newMeetup('Saturday brunch')
    const first = scripted(
      reply('tool_use', [thinking('find the town'), call('search_towns', { query: 'Westford, NC' })]),
      reply('tool_use', [thinking('save it'), call('set_my_start', { townId: 1, maxMinutes: 45 })]),
      reply('end_turn', [thinking('confirm'), text('Got it: Westford, NC, up to 45 minutes.')]),
    )

    const sent = await as(ana, first.planner).checkin.send({ meetupId, text: 'I start in Westford NC, 45 min max' })
    expect(sent.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'I start in Westford NC, 45 min max'],
      ['assistant', 'Got it: Westford, NC, up to 45 minutes.'],
    ])
    expect(await busy(meetupId, ana)).toBeNull()

    // The tool really saved the start.
    const page = await as(ana).meetups.get({ meetupId })
    expect(page.members.find((m) => m.isMe)).toMatchObject({ maxMinutes: 45, start: { townId: 1 } })

    // Each request carries the model settings, and all the tool results of a step go back together.
    expect(first.requests).toHaveLength(3)
    for (const r of first.requests) {
      expect(r).toMatchObject({
        model: 'claude-opus-5-5',
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' },
      })
      expect(r.system).toContain('Saturday brunch')
      expect(r.system).toContain('Ana')
    }
    const searchResult = first.requests[1]!.messages.at(-1)!
    expect(searchResult.role).toBe('user')
    expect(searchResult.content).toEqual([
      expect.objectContaining({
        type: 'tool_result',
        is_error: false,
        content: expect.stringContaining('Westford, NC'),
      }),
    ])

    // The history shows only what Ana and the planner said.
    const history = await as(ana, first.planner).checkin.history({ meetupId })
    expect(history.enabled).toBe(true)
    expect(history.messages.map((m) => m.text)).toEqual([
      'I start in Westford NC, 45 min max',
      'Got it: Westford, NC, up to 45 minutes.',
    ])

    // The next turn sends the whole earlier conversation back unchanged, thinking included.
    const second = scripted(reply('end_turn', [text('See you there.')]))
    await as(ana, second.planner).checkin.send({ meetupId, text: 'thanks' })
    const replayed = second.requests[0]!.messages
    const finalOfFirst = first.requests[2]!.messages
    expect(replayed.slice(0, finalOfFirst.length)).toEqual(finalOfFirst)
    expect(replayed[finalOfFirst.length]).toEqual({
      role: 'assistant',
      content: [thinking('confirm'), text('Got it: Westford, NC, up to 45 minutes.')],
    })
    expect(replayed.at(-1)).toEqual({ role: 'user', content: [{ type: 'text', text: 'thanks' }] })
  })

  it("keeps one member's notes and limits out of another member's chat", async () => {
    const meetupId = await newMeetup('Private notes')
    await as(ana).meetups.setMyStart({ meetupId, townId: 1, maxMinutes: 37 })
    await as(ben).meetups.setMyStart({ meetupId, townId: 3, maxMinutes: 90 })

    const anaTurn = scripted(
      reply('tool_use', [call('save_constraint', { kind: 'budget', detail: 'Ana secret: under $25' })]),
      reply('end_turn', [text('Noted, privately.')]),
    )
    await as(ana, anaTurn.planner).checkin.send({ meetupId, text: 'Keep it under $25 for me' })

    const benTurn = scripted(
      reply('tool_use', [call('get_meetup', {}), call('get_fair_areas', {})]),
      reply('end_turn', [text('Here is the group.')]),
    )
    await as(ben, benTurn.planner).checkin.send({ meetupId, text: 'Who is coming?' })

    const results = benTurn.requests[1]!.messages.at(-1)!.content as { content: string; is_error: boolean }[]
    expect(results).toHaveLength(2)
    const [meetup, fair] = results.map((r) => {
      expect(r.is_error).toBe(false)
      return JSON.parse(r.content)
    })
    expect(meetup.me).toMatchObject({ name: 'Ben', maxMinutes: 90, privateNotes: [] })
    expect(meetup.others).toEqual([{ name: 'Ana', role: 'organizer', checkedIn: true, startTown: 'Westford, NC' }])
    const everything = JSON.stringify(benTurn.requests)
    expect(everything).not.toContain('Ana secret')
    expect(everything).not.toContain('$25')
    expect(everything).not.toMatch(/:37[,}]/) // Ana's drive limit, as a value anywhere
    for (const area of [...fair.areas, ...fair.closestMisses]) {
      for (const t of area.times) {
        if (t.name === 'Ben (you)') expect(t.myLimit).toBe(90)
        else expect(t).not.toHaveProperty('myLimit')
      }
    }

    // Ben's history doesn't hold Ana's chat, and Ana still sees her note.
    expect((await as(ben, benTurn.planner).checkin.history({ meetupId })).messages.map((m) => m.text)).toEqual([
      'Who is coming?',
      'Here is the group.',
    ])
    const anaView = await runPlannerTool({ db, towns, meetupId, userId: ana.id }, 'get_meetup', {})
    expect(JSON.parse(anaView.content).me.privateNotes).toEqual([
      expect.objectContaining({ kind: 'budget', detail: 'Ana secret: under $25' }),
    ])

    // Ben can't remove Ana's note even with its id.
    const noteId = JSON.parse(anaView.content).me.privateNotes[0].id
    const removal = await runPlannerTool({ db, towns, meetupId, userId: ben.id }, 'remove_constraint', {
      constraintId: noteId,
    })
    expect(removal).toEqual({ content: 'No note with that id.', isError: true })
  })

  it('hands bad tool calls back to the planner as errors', async () => {
    const meetupId = await newMeetup('Bad calls')
    const ctx = { db, towns, meetupId, userId: ana.id }
    expect(await runPlannerTool(ctx, 'cast_ballot', {})).toMatchObject({ isError: true })
    expect(await runPlannerTool(ctx, 'toString', {})).toMatchObject({ isError: true })
    expect(await runPlannerTool(ctx, 'set_my_start', { townId: 1, maxMinutes: 2 })).toMatchObject({ isError: true })
    expect(await runPlannerTool(ctx, 'set_my_start', { townId: 999, maxMinutes: 60 })).toMatchObject({ isError: true })
    expect(
      await runPlannerTool(ctx, 'get_meetup', { meetupId: randomUUID() }), // no input may name another meetup
    ).toMatchObject({ isError: true })
  })

  it('refuses a second message while the first is still being answered', async () => {
    const meetupId = await newMeetup('Busy')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const slow: PlannerModel = {
      async create() {
        await gate
        return reply('end_turn', [text('Done.')])
      },
    }
    const planner = { model: slow, config: DEFAULT_PLANNER }
    const first = as(ana, planner).checkin.send({ meetupId, text: 'one' })
    await expect.poll(() => busy(meetupId, ana)).not.toBeNull()
    await expect(as(ana, planner).checkin.send({ meetupId, text: 'two' })).rejects.toMatchObject({ code: 'CONFLICT' })
    release()
    await first
    expect(await busy(meetupId, ana)).toBeNull()
    expect((await as(ana, planner).checkin.history({ meetupId })).messages.map((m) => m.text)).toEqual(['one', 'Done.'])
  })

  it('lets a stale lease be taken over without the old turn saving or clearing the new one', async () => {
    const meetupId = await newMeetup('Takeover')
    const gated = (answer: string) => {
      let open!: () => void
      const gate = new Promise<void>((r) => (open = r))
      const model: PlannerModel = {
        async create() {
          await gate
          return reply('end_turn', [text(answer)])
        },
      }
      return { open, planner: { model, config: DEFAULT_PLANNER } }
    }
    const claim = async () => {
      const [row] = await db
        .select({ claim: meetupMember.checkinClaim })
        .from(meetupMember)
        .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, ana.id)))
      return row?.claim ?? null
    }

    const old = gated('Old reply.')
    const oldTurn = as(ana, old.planner).checkin.send({ meetupId, text: 'first' })
    await expect.poll(claim).not.toBeNull()
    const oldClaim = await claim()

    // The first turn hangs past the lease timeout without renewing (as if its
    // function froze), so a new message may take over.
    await db
      .update(meetupMember)
      .set({ checkinBusySince: new Date(Date.now() - 6 * 60_000) })
      .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, ana.id)))
    const fresh = gated('New reply.')
    const newTurn = as(ana, fresh.planner).checkin.send({ meetupId, text: 'second' })
    await expect.poll(claim).not.toBe(oldClaim)
    const newClaim = await claim()

    // The old turn finishes first: it can't save, and it leaves the new lease alone.
    old.open()
    await expect(oldTurn).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await claim()).toBe(newClaim)
    expect(await busy(meetupId, ana)).not.toBeNull()

    fresh.open()
    await newTurn
    expect(await claim()).toBeNull()
    expect(await busy(meetupId, ana)).toBeNull()
    expect((await as(ana, fresh.planner).checkin.history({ meetupId })).messages.map((m) => m.text)).toEqual([
      'second',
      'New reply.',
    ])
  })

  it('stops a taken-over turn before it runs the tools in its reply', async () => {
    const meetupId = await newMeetup('Stale tools')
    let open!: () => void
    const gate = new Promise<void>((r) => (open = r))
    const stale: PlannerModel = {
      async create() {
        await gate
        return reply('tool_use', [
          call('set_my_start', { townId: 3, maxMinutes: 60 }),
          call('add_to_shortlist', { townId: 2 }),
        ])
      },
    }
    const mine = and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, ana.id))
    const oldTurn = as(ana, { model: stale, config: DEFAULT_PLANNER }).checkin.send({ meetupId, text: 'first' })
    await expect.poll(() => busy(meetupId, ana)).not.toBeNull()

    // While the model call hangs, its lease goes stale and another turn takes it.
    await db
      .update(meetupMember)
      .set({ checkinBusySince: new Date(Date.now() - 6 * 60_000) })
      .where(mine)
    await db.update(meetupMember).set({ checkinClaim: randomUUID(), checkinBusySince: new Date() }).where(mine)

    open()
    await expect(oldTurn).rejects.toMatchObject({ code: 'CONFLICT' })
    const page = await as(ana).meetups.get({ meetupId })
    expect(page.members.find((m) => m.isMe)?.start).toBeNull()
    expect((await as(ana).shortlist.list({ meetupId })).items).toEqual([])
  })

  it('stores nothing when the planner refuses or fails, and frees the chat', async () => {
    const meetupId = await newMeetup('Failures')
    const refused = scripted(reply('refusal', []))
    await expect(as(ana, refused.planner).checkin.send({ meetupId, text: 'hmm' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
    })

    const badKey = scripted(() => {
      throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers())
    })
    await expect(as(ana, badKey.planner).checkin.send({ meetupId, text: 'hmm' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: "The planner's API key isn't working.",
    })

    const overloaded = scripted(() => {
      throw new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers())
    })
    await expect(as(ana, overloaded.planner).checkin.send({ meetupId, text: 'hmm' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })

    const rows = await db
      .select({ id: checkinMessage.id })
      .from(checkinMessage)
      .where(and(eq(checkinMessage.meetupId, meetupId), eq(checkinMessage.userId, ana.id)))
    expect(rows).toEqual([])
    expect(await busy(meetupId, ana)).toBeNull()
  })

  it('stops a turn that loops on tools', async () => {
    const meetupId = await newMeetup('Loop')
    const loop = scripted(...Array.from({ length: 8 }, () => reply('tool_use', [call('get_shortlist', {})])))
    await expect(as(ana, loop.planner).checkin.send({ meetupId, text: 'go' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
    })
    expect(loop.requests).toHaveLength(8)
    expect(await busy(meetupId, ana)).toBeNull()
  })
})
