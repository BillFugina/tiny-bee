import { TRPCError } from '@trpc/server'
import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { meetup, meetupMember, user } from '../db/schema.js'

export function listMembers(db: Db, meetupId: string) {
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

export type MemberRow = Awaited<ReturnType<typeof listMembers>>[number]
export type ReadyMember = MemberRow & { startLat: number; startLng: number; maxMinutes: number }

export function hasStart(m: MemberRow): m is ReadyMember {
  return m.startLat !== null && m.startLng !== null && m.maxMinutes !== null
}

export async function findMembership(db: Db, meetupId: string, userId: string) {
  const [row] = await db
    .select({ role: meetupMember.role })
    .from(meetupMember)
    .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, userId)))
  return row
}

/** Members only; a missing meetup and someone else's meetup look the same from outside. */
export async function requireMember(db: Db, meetupId: string, userId: string) {
  const membership = await findMembership(db, meetupId, userId)
  if (!membership) throw new TRPCError({ code: 'FORBIDDEN', message: 'Join this meetup to see it.' })
  return membership
}

export async function requireOrganizer(db: Db, meetupId: string, userId: string) {
  const membership = await requireMember(db, meetupId, userId)
  if (membership.role !== 'organizer') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the organizer can do that.' })
  }
  return membership
}

/** The meetup's phase and vote settings. Call after a membership check. */
export async function getMeetupState(db: Db, meetupId: string) {
  const [row] = await db
    .select({
      id: meetup.id,
      title: meetup.title,
      phase: meetup.phase,
      votingDeadline: meetup.votingDeadline,
      decidedAt: meetup.decidedAt,
      result: meetup.result,
    })
    .from(meetup)
    .where(eq(meetup.id, meetupId))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'That meetup does not exist.' })
  return row
}
