import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { estimatedTravelTimes, findFairAreas, geometricMedian, distanceKm, type Traveler } from '../../domain/index.js'
import type { Db } from '../db/client.js'
import { meetup, meetupMember, user } from '../db/schema.js'
import { townLabel, type TownDirectory } from '../places/directory.js'
import { findMembership, getMeetupState, hasStart, listMembers, requireMember } from './members.js'

/** How many ranked areas the meetup page shows. */
const AREAS_SHOWN = 5
/** Room around the group, in km, when collecting towns to consider. */
const SEARCH_MARGIN_KM = 50

export async function createMeetup(db: Db, input: { title: string }, userId: string) {
  const [created] = await db
    .insert(meetup)
    .values({ title: input.title, organizerId: userId })
    .returning({ id: meetup.id, title: meetup.title, createdAt: meetup.createdAt })
  if (!created) throw new Error('Insert returned no row')
  // neon-http has no interactive transactions; a failed second insert leaves
  // a meetup with no member row, which listMine ignores.
  await db.insert(meetupMember).values({ meetupId: created.id, userId, role: 'organizer' })
  return created
}

export function listMyMeetups(db: Db, userId: string) {
  return db
    .select({
      id: meetup.id,
      title: meetup.title,
      role: meetupMember.role,
      phase: meetup.phase,
      createdAt: meetup.createdAt,
      memberCount:
        sql<number>`(select count(*) from meetup_member as others where others.meetup_id = ${meetup.id})`.mapWith(
          Number,
        ),
    })
    .from(meetupMember)
    .innerJoin(meetup, eq(meetup.id, meetupMember.meetupId))
    .where(eq(meetupMember.userId, userId))
    .orderBy(desc(meetup.createdAt))
}

/** What someone with the invite link sees before joining. */
export async function previewMeetup(db: Db, meetupId: string, userId: string) {
  const [found] = await db
    .select({ id: meetup.id, title: meetup.title, organizer: user.name })
    .from(meetup)
    .innerJoin(user, eq(user.id, meetup.organizerId))
    .where(eq(meetup.id, meetupId))
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'That meetup does not exist.' })
  const [members] = await db.select({ n: count() }).from(meetupMember).where(eq(meetupMember.meetupId, meetupId))
  const isMember = (await findMembership(db, meetupId, userId)) !== undefined
  return { ...found, memberCount: members?.n ?? 0, isMember }
}

export async function joinMeetup(db: Db, meetupId: string, userId: string) {
  const [found] = await db.select({ id: meetup.id }).from(meetup).where(eq(meetup.id, meetupId))
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'That meetup does not exist.' })
  await db.insert(meetupMember).values({ meetupId, userId, role: 'member' }).onConflictDoNothing()
  return { joined: true }
}

/** The meetup page: members and where each starts. Members only. */
export async function getMeetup(db: Db, meetupId: string, userId: string) {
  await requireMember(db, meetupId, userId)
  const state = await getMeetupState(db, meetupId)
  const members = await listMembers(db, meetupId)
  return {
    id: state.id,
    title: state.title,
    phase: state.phase,
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      role: m.role,
      isMe: m.userId === userId,
      start: m.startTownId === null ? null : { townId: m.startTownId, label: m.startLabel ?? '' },
      maxMinutes: m.maxMinutes,
    })),
  }
}

export async function setMyStart(
  db: Db,
  towns: TownDirectory,
  input: { meetupId: string; townId: number; maxMinutes: number },
  userId: string,
) {
  await requireMember(db, input.meetupId, userId)
  const town = towns.get(input.townId)
  if (!town) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a town from the list.' })
  await db
    .update(meetupMember)
    .set({
      startTownId: town.id,
      startLabel: townLabel(town),
      startLat: town.lat,
      startLng: town.lng,
      maxMinutes: input.maxMinutes,
    })
    .where(and(eq(meetupMember.meetupId, input.meetupId), eq(meetupMember.userId, userId)))
  return { label: townLabel(town), maxMinutes: input.maxMinutes }
}

/**
 * The fairest places to meet, from everyone who has set a start. Travel times
 * are estimates from straight-line distance until a maps provider is wired in.
 */
export async function fairAreas(
  db: Db,
  towns: TownDirectory,
  input: { meetupId: string; averageWeight: number },
  userId: string,
) {
  await requireMember(db, input.meetupId, userId)
  const members = await listMembers(db, input.meetupId)
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
  const places = towns
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
      isMe: t.memberId === userId,
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
}
