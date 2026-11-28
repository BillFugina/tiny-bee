import type Anthropic from '@anthropic-ai/sdk'
import { TRPCError } from '@trpc/server'
import { and, asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { DRIVE_LIMIT, PLAN_STEP_TARGETS, shortlistNoteField } from '../../shared/schemas.js'
import type { Db } from '../db/client.js'
import { memberConstraint } from '../db/schema.js'
import { fairAreas, getMeetup, setMyStart } from '../meetups/meetups.js'
import { addItem, viewShortlist } from '../meetups/shortlist.js'
import { voteStatus } from '../meetups/vote.js'
import { townLabel, type TownDirectory } from '../places/directory.js'

/**
 * Everything a tool may touch. A tool acts as this one member in this one
 * meetup and can reach nothing else: there is no tool input that names
 * another member or another meetup.
 */
export interface ToolContext {
  db: Db
  towns: TownDirectory
  meetupId: string
  userId: string
  /** The app's public origin, for the invite link; null gives a path instead. */
  origin?: string | null
}

/** Most private notes a member can keep, so one chat can't grow without end. */
export const CONSTRAINTS_MAX = 20

export const CONSTRAINT_KINDS = ['budget', 'food', 'accessibility', 'timing', 'travel', 'other'] as const

interface PlannerTool<S extends z.ZodType> {
  description: string
  input: S
  run(ctx: ToolContext, input: z.output<S>): Promise<unknown>
}

const tool = <S extends z.ZodType>(t: PlannerTool<S>) => t

const noInput = z.strictObject({})

/** The member's own notes, oldest first. Only ever read for that member. */
export function listConstraints(db: Db, meetupId: string, userId: string) {
  return db
    .select({ id: memberConstraint.id, kind: memberConstraint.kind, detail: memberConstraint.detail })
    .from(memberConstraint)
    .where(and(eq(memberConstraint.meetupId, meetupId), eq(memberConstraint.userId, userId)))
    .orderBy(asc(memberConstraint.createdAt), asc(memberConstraint.id))
}

export const plannerTools = {
  get_meetup: tool({
    description:
      "The meetup's title and phase, this member's own start, drive limit and private notes, and who else is in the group (names and starting towns only).",
    input: noInput,
    async run(ctx) {
      const meetup = await getMeetup(ctx.db, ctx.meetupId, ctx.userId)
      const me = meetup.members.find((m) => m.isMe)
      return {
        title: meetup.title,
        phase: meetup.phase,
        me: me && {
          name: me.name,
          role: me.role,
          start: me.start?.label ?? null,
          maxMinutes: me.maxMinutes,
          privateNotes: await listConstraints(ctx.db, ctx.meetupId, ctx.userId),
        },
        // Others by name and town only. Their limits and notes are theirs.
        others: meetup.members
          .filter((m) => !m.isMe)
          .map((m) => ({ name: m.name, role: m.role, checkedIn: m.start !== null, startTown: m.start?.label ?? null })),
      }
    },
  }),

  get_invite_link: tool({
    description:
      "The link that invites friends to this meetup, and a short invite message ready to paste into a text or email. Anyone with the link can sign in and join. The member sends it themselves: you can't message anyone.",
    input: noInput,
    async run(ctx) {
      const meetup = await getMeetup(ctx.db, ctx.meetupId, ctx.userId)
      const link = `${ctx.origin ?? ''}/m/${ctx.meetupId}`
      return {
        link,
        inviteMessage: `Help me pick a place for "${meetup.title}" on tiny-bee. It finds somewhere that's a fair drive for everyone. Join here: ${link}`,
        membersSoFar: meetup.members.length,
        whereOnThePage: 'The same link is in the box at the top of the meetup page, with Copy link and Share buttons.',
      }
    },
  }),

  search_towns: tool({
    description: 'Find towns by name. Returns up to 8 matches with the townId other tools need.',
    input: z.strictObject({ query: z.string().trim().min(2).max(80).describe('Part of a town name, like "Ashev"') }),
    async run(ctx, { query }) {
      return ctx.towns
        .search(query)
        .slice(0, 8)
        .map((t) => ({ townId: t.id, label: townLabel(t) }))
    },
  }),

  set_my_start: tool({
    description: "Save this member's starting town and the longest drive they'll do, replacing any earlier one.",
    input: z.strictObject({
      townId: z.number().int().positive().describe('From search_towns'),
      maxMinutes: z.number().int().min(DRIVE_LIMIT.min).max(DRIVE_LIMIT.max).describe('Longest drive, in minutes'),
    }),
    run: (ctx, input) => setMyStart(ctx.db, ctx.towns, { meetupId: ctx.meetupId, ...input }, ctx.userId),
  }),

  save_constraint: tool({
    description:
      'Save one private note about what this member needs, like a budget, a food need or a time they must leave. Only this member and you can see it.',
    input: z.strictObject({
      kind: z.enum(CONSTRAINT_KINDS),
      detail: z.string().trim().min(2).max(300).describe('Short, in your own words, like "Under $40 a head"'),
    }),
    async run(ctx, input) {
      const [row] = await ctx.db
        .select({ n: count() })
        .from(memberConstraint)
        .where(and(eq(memberConstraint.meetupId, ctx.meetupId), eq(memberConstraint.userId, ctx.userId)))
      if ((row?.n ?? 0) >= CONSTRAINTS_MAX) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `There are already ${CONSTRAINTS_MAX} notes. Remove one first.`,
        })
      }
      const [saved] = await ctx.db
        .insert(memberConstraint)
        .values({ meetupId: ctx.meetupId, userId: ctx.userId, ...input })
        .returning({ id: memberConstraint.id })
      return { saved: saved?.id }
    },
  }),

  remove_constraint: tool({
    description: "Remove one of this member's private notes by its id from get_meetup.",
    input: z.strictObject({ constraintId: z.uuid() }),
    async run(ctx, { constraintId }) {
      const removed = await ctx.db
        .delete(memberConstraint)
        .where(
          and(
            eq(memberConstraint.id, constraintId),
            eq(memberConstraint.meetupId, ctx.meetupId),
            eq(memberConstraint.userId, ctx.userId),
          ),
        )
        .returning({ id: memberConstraint.id })
      if (removed.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'No note with that id.' })
      return { removed: constraintId }
    },
  }),

  get_fair_areas: tool({
    description:
      "Areas that are fairest on estimated driving time for everyone who has set a start, with each person's time. Lists who hasn't set a start yet.",
    input: z.strictObject({
      averageWeight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('0 (default) ranks by the longest single trip, 1 by the average trip'),
    }),
    async run(ctx, { averageWeight }) {
      const result = await fairAreas(
        ctx.db,
        ctx.towns,
        { meetupId: ctx.meetupId, averageWeight: averageWeight ?? 0 },
        ctx.userId,
      )
      // Each person's time stays (the whole group sees it), but only this
      // member's own limit goes to the model.
      const present = (area: (typeof result.areas)[number]) => ({
        name: area.name,
        longestMinutes: area.longest,
        averageMinutes: area.average,
        peopleOverTheirLimit: area.overLimitCount,
        times: area.times.map((t) => ({
          name: t.isMe ? `${t.name} (you)` : t.name,
          minutes: t.minutes,
          ...(t.isMe ? { myLimit: t.maxMinutes } : {}),
        })),
      })
      return {
        estimated: result.estimated,
        waitingOn: result.waitingOn,
        areas: result.areas.map(present),
        closestMisses: result.closestMisses.map(present),
      }
    },
  }),

  get_shortlist: tool({
    description: 'The places on the shortlist the group will vote on, with notes and who added them.',
    input: noInput,
    async run(ctx) {
      const list = await viewShortlist(ctx.db, ctx.meetupId, ctx.userId)
      return {
        phase: list.phase,
        max: list.max,
        items: list.items.map((i) => ({
          itemId: i.id,
          townId: i.townId,
          label: i.label,
          note: i.note,
          addedBy: i.addedBy,
        })),
      }
    },
  }),

  add_to_shortlist: tool({
    description:
      'Add a town to the shortlist everyone sees. Only when this member asked for it or said yes when you offered.',
    input: z.strictObject({
      townId: z.number().int().positive().describe('From search_towns or get_fair_areas'),
      note: shortlistNoteField.optional(),
    }),
    run: (ctx, input) => addItem(ctx.db, ctx.towns, { meetupId: ctx.meetupId, ...input }, ctx.userId),
  }),

  get_vote_status: tool({
    description:
      "Where the vote stands: phase, deadline, turnout, whether this member has voted, and the result once decided. Never shows anyone's ballot.",
    input: noInput,
    async run(ctx) {
      const status = await voteStatus(ctx.db, ctx.meetupId, ctx.userId)
      return {
        phase: status.phase,
        deadline: status.deadline,
        turnout: status.turnout,
        iVoted: status.iVoted,
        candidates: status.candidates.map((c) => c.label),
        result: status.result,
      }
    },
  }),

  offer_step_button: tool({
    description:
      "Shows a button under your reply that takes the member to a step of the meetup page. 'invite' is the organizer's step for inviting the group. 'towns' is the fairest towns and the shortlist, which opens once at least two members have a starting town. Use it when you suggest that step as what to do next, like when their check-in is done.",
    input: z.strictObject({ step: z.enum(PLAN_STEP_TARGETS).describe('The step the button opens') }),
    async run(ctx, { step }) {
      const meetup = await getMeetup(ctx.db, ctx.meetupId, ctx.userId)
      if (meetup.phase !== 'planning') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The group is past planning, so there are no steps to open.',
        })
      }
      const me = meetup.members.find((m) => m.isMe)
      if (step === 'invite' && me?.role !== 'organizer') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only the organizer has the invite step. Give this member the link from get_invite_link instead.',
        })
      }
      if (step === 'towns' && meetup.members.filter((m) => m.start && m.maxMinutes).length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The fairest towns open once at least two members have a starting town. Nothing to show yet.',
        })
      }
      return { shown: true, step }
    },
  }),
}

export type PlannerToolName = keyof typeof plannerTools

/** The tool list sent to the model, built from the same zod schemas that check the input. */
export const plannerToolDefinitions: Anthropic.Beta.Messages.BetaTool[] = Object.entries(plannerTools).map(
  ([name, t]) => {
    const schema = z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>
    delete schema.$schema
    return {
      name,
      description: t.description,
      input_schema: schema as Anthropic.Beta.Messages.BetaTool.InputSchema,
    }
  },
)

export interface ToolOutcome {
  content: string
  isError: boolean
}

/** Runs one tool call. Bad input and refused actions come back as errors the model can read. */
export async function runPlannerTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  const entry = Object.hasOwn(plannerTools, name) ? plannerTools[name as PlannerToolName] : undefined
  if (!entry) return { content: `There is no tool called ${name}.`, isError: true }
  const parsed = entry.input.safeParse(input)
  if (!parsed.success) return { content: `Invalid input: ${z.prettifyError(parsed.error)}`, isError: true }
  try {
    // Each entry's run matches its own schema; TypeScript can't see that through the union.
    const result = await (entry.run as (c: ToolContext, i: unknown) => Promise<unknown>)(ctx, parsed.data)
    return { content: JSON.stringify(result ?? null), isError: false }
  } catch (error) {
    if (error instanceof TRPCError && error.code !== 'INTERNAL_SERVER_ERROR') {
      return { content: error.message, isError: true }
    }
    throw error
  }
}
