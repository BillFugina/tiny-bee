import { TRPCError } from '@trpc/server'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { estimatedTravelTimes, findFairAreas, geometricMedian, distanceKm, type Traveler } from '../../domain/index.js'
import { meetup, meetupMember, user } from '../db/schema.js'
import type { Db } from '../db/client.js'
import { townLabel } from '../places/directory.js'
import { createMeetupInput, fairAreasInput, meetupIdInput, setStartInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

/** How many ranked areas the meetup page shows. */
const AREAS_SHOWN = 5
/** Room around the group, in km, when collecting towns to consider. */
const SEARCH_MARGIN_KM = 50

export const meetupsRouter = router({
  create: protectedProcedure.input(createMeetupInput).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(meetup)
      .values({ title: input.title, organizerId: ctx.user.id })
      .returning({ id: meetup.id, title: meetup.title, createdAt: meetup.createdAt })
    if (!created) throw new Error('Insert returned no row')
    // neon-http has no interactive transactions; a failed second insert leaves
    // a meetup with no member row, which listMine ignores. Fine for the skeleton.
    await ctx.db.insert(meetupMember).values({ meetupId: created.id, userId: ctx.user.id, role: 'organizer' })
    return created
  }),

  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: meetup.id, title: meetup.title, role: meetupMember.role, createdAt: meetup.createdAt })
      .from(meetupMember)
      .innerJoin(meetup, eq(meetup.id, meetupMember.meetupId))
      .where(eq(meetupMember.userId, ctx.user.id))
      .orderBy(desc(meetup.createdAt)),
  ),

  /** What someone with the invite link sees before joining. */
  preview: protectedProcedure.input(meetupIdInput).query(async ({ ctx, input }) => {
    const [found] = await ctx.db
      .select({ id: meetup.id, title: meetup.title, organizer: user.name })
      .from(meetup)
      .innerJoin(user, eq(user.id, meetup.organizerId))
      .where(eq(meetup.id, input.meetupId))
    if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'That meetup does not exist.' })
    const [members] = await ctx.db
      .select({ n: count() })
      .from(meetupMember)
      .where(eq(meetupMember.meetupId, input.meetupId))
    const isMember = (await findMembership(ctx.db, input.meetupId, ctx.user.id)) !== undefined
    return { ...found, memberCount: members?.n ?? 0, isMember }
  }),

  join: protectedProcedure.input(meetupIdInput).mutation(async ({ ctx, input }) => {
    const [found] = await ctx.db.select({ id: meetup.id }).from(meetup).where(eq(meetup.id, input.meetupId))
    if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'That meetup does not exist.' })
    await ctx.db
      .insert(meetupMember)
      .values({ meetupId: input.meetupId, userId: ctx.user.id, role: 'member' })
      .onConflictDoNothing()
    return { joined: true }
  }),

  /** The meetup page: members and where each starts. Members only. */
  get: protectedProcedure.input(meetupIdInput).query(async ({ ctx, input }) => {
    await requireMember(ctx.db, input.meetupId, ctx.user.id)
    const [found] = await ctx.db
      .select({ id: meetup.id, title: meetup.title })
      .from(meetup)
      .where(eq(meetup.id, input.meetupId))
    const members = await listMembers(ctx.db, input.meetupId)
    return {
      ...found!,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
        isMe: m.userId === ctx.user.id,
        start: m.startTownId === null ? null : { townId: m.startTownId, label: m.startLabel ?? '' },
        maxMinutes: m.maxMinutes,
      })),
    }
  }),

  setMyStart: protectedProcedure.input(setStartInput).mutation(async ({ ctx, input }) => {
    await requireMember(ctx.db, input.meetupId, ctx.user.id)
    const town = ctx.towns.get(input.townId)
    if (!town) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a town from the list.' })
    await ctx.db
      .update(meetupMember)
      .set({
        startTownId: town.id,
        startLabel: townLabel(town),
        startLat: town.lat,
        startLng: town.lng,
        maxMinutes: input.maxMinutes,
      })
      .where(and(eq(meetupMember.meetupId, input.meetupId), eq(meetupMember.userId, ctx.user.id)))
    return { label: townLabel(town), maxMinutes: input.maxMinutes }
  }),

  /**
   * The fairest places to meet, from everyone who has set a start. Travel times
   * are estimates from straight-line distance until a maps provider is wired in.
   */
  fairAreas: protectedProcedure.input(fairAreasInput).query(async ({ ctx, input }) => {
    await requireMember(ctx.db, input.meetupId, ctx.user.id)
    const members = await listMembers(ctx.db, input.meetupId)
    const ready = members.filter(hasStart)
    const waitingOn = members.filter((m) => !hasStart(m)).map((m) => m.name)
    const names = new Map(members.map((m) => [m.userId, m.name]))

    if (ready.length < 2) {
      return { estimated: true, ready: ready.length, waitingOn, areas: [], closestMisses: [] }
    }

    const travelers: Traveler[] = ready.map((m) => ({
      memberId: m.userId,
      origin: { lat: m.startLat, lng: m.startLng },
      maxMinutes: m.maxMinutes,
    }))
    const center = geometricMedian(travelers.map((t) => t.origin))
    const reach = Math.max(...travelers.map((t) => distanceKm(center, t.origin))) + SEARCH_MARGIN_KM
    const places = ctx.towns
      .near(center, reach)
      .map((t) => ({ id: String(t.id), name: townLabel(t), lat: t.lat, lng: t.lng }))

    const result = await findFairAreas({
      travelers,
      places,
      travelTimes: estimatedTravelTimes(),
      averageWeight: input.averageWeight,
    })

    const present = (area: (typeof result.areas)[number]) => ({
      id: area.candidate.id,
      name: area.candidate.name,
      isMidpoint: area.candidate.source === 'median',
      lat: area.candidate.lat,
      lng: area.candidate.lng,
      longest: Math.round(area.longest),
      average: Math.round(area.average),
      overLimitCount: area.overLimitCount,
      times: area.times.map((t) => ({
        name: names.get(t.memberId) ?? 'Someone',
        isMe: t.memberId === ctx.user.id,
        minutes: Math.round(t.minutes),
        maxMinutes: t.maxMinutes,
      })),
    })

    return {
      estimated: true,
      ready: ready.length,
      waitingOn,
      areas: result.areas.slice(0, AREAS_SHOWN).map(present),
      closestMisses: result.areas.length === 0 ? result.overLimit.slice(0, 3).map(present) : [],
    }
  }),
})

type MemberRow = Awaited<ReturnType<typeof listMembers>>[number]
type ReadyMember = MemberRow & { startLat: number; startLng: number; maxMinutes: number }

function hasStart(m: MemberRow): m is ReadyMember {
  return m.startLat !== null && m.startLng !== null && m.maxMinutes !== null
}

function listMembers(db: Db, meetupId: string) {
  return db
    .select({
      userId: meetupMember.userId,
      name: user.name,
      role: meetupMember.role,
      startTownId: meetupMember.startTownId,
      startLabel: meetupMember.startLabel,
      startLat: meetupMember.startLat,
      startLng: meetupMember.startLng,
      maxMinutes: meetupMember.maxMinutes,
    })
    .from(meetupMember)
    .innerJoin(user, eq(user.id, meetupMember.userId))
    .where(eq(meetupMember.meetupId, meetupId))
    .orderBy(asc(meetupMember.joinedAt))
}

async function findMembership(db: Db, meetupId: string, userId: string) {
  const [row] = await db
    .select({ role: meetupMember.role })
    .from(meetupMember)
    .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, userId)))
  return row
}

/** Members only; a missing meetup and someone else's meetup look the same from outside. */
async function requireMember(db: Db, meetupId: string, userId: string) {
  const membership = await findMembership(db, meetupId, userId)
  if (!membership) throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this meetup to see it.' })
  return membership
}
