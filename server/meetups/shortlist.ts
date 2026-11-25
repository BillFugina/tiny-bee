import { TRPCError } from '@trpc/server'
import { and, asc, count, eq } from 'drizzle-orm'
import { SHORTLIST_MAX } from '../../shared/schemas.js'
import type { Db } from '../db/client.js'
import { shortlistItem, user } from '../db/schema.js'
import { townLabel, type TownDirectory } from '../places/directory.js'
import { getMeetupState, requireMember } from './members.js'

/** Shortlist items in the order they were added, which is also the vote's candidate order. */
export function listItems(db: Db, meetupId: string) {
  return db
    .select({
      id: shortlistItem.id,
      townId: shortlistItem.townId,
      label: shortlistItem.label,
      note: shortlistItem.note,
      addedBy: shortlistItem.addedBy,
      addedByName: user.name,
    })
    .from(shortlistItem)
    .leftJoin(user, eq(user.id, shortlistItem.addedBy))
    .where(eq(shortlistItem.meetupId, meetupId))
    .orderBy(asc(shortlistItem.createdAt), asc(shortlistItem.id))
}

export async function viewShortlist(db: Db, meetupId: string, userId: string) {
  const { role } = await requireMember(db, meetupId, userId)
  const { phase } = await getMeetupState(db, meetupId)
  const items = await listItems(db, meetupId)
  return {
    phase,
    max: SHORTLIST_MAX,
    items: items.map((item) => ({
      id: item.id,
      townId: item.townId,
      label: item.label,
      note: item.note,
      addedBy: item.addedByName ?? 'Someone who left',
      canRemove: phase === 'planning' && (role === 'organizer' || item.addedBy === userId),
    })),
  }
}

export async function addItem(
  db: Db,
  towns: TownDirectory,
  input: { meetupId: string; townId: number; note?: string | undefined },
  userId: string,
) {
  await requireMember(db, input.meetupId, userId)
  await requirePlanning(db, input.meetupId)
  const town = towns.get(input.townId)
  if (!town) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a town from the list.' })

  const [current] = await db
    .select({ n: count() })
    .from(shortlistItem)
    .where(eq(shortlistItem.meetupId, input.meetupId))
  if ((current?.n ?? 0) >= SHORTLIST_MAX) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `The shortlist holds ${SHORTLIST_MAX} places at most.` })
  }

  const [added] = await db
    .insert(shortlistItem)
    .values({
      meetupId: input.meetupId,
      townId: town.id,
      label: townLabel(town),
      lat: town.lat,
      lng: town.lng,
      note: input.note ? input.note : null,
      addedBy: userId,
    })
    .onConflictDoNothing()
    .returning({ id: shortlistItem.id, label: shortlistItem.label })
  if (!added) throw new TRPCError({ code: 'CONFLICT', message: `${townLabel(town)} is already on the shortlist.` })
  return added
}

export async function removeItem(db: Db, input: { meetupId: string; itemId: string }, userId: string) {
  const { role } = await requireMember(db, input.meetupId, userId)
  await requirePlanning(db, input.meetupId)
  const mine = and(eq(shortlistItem.id, input.itemId), eq(shortlistItem.meetupId, input.meetupId))
  const [item] = await db.select({ addedBy: shortlistItem.addedBy }).from(shortlistItem).where(mine)
  if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'That place is not on the shortlist.' })
  if (role !== 'organizer' && item.addedBy !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only whoever added it, or the organizer, can remove it.' })
  }
  await db.delete(shortlistItem).where(mine)
  return { removed: true }
}

async function requirePlanning(db: Db, meetupId: string) {
  const { phase } = await getMeetupState(db, meetupId)
  if (phase !== 'planning') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting has started, so the shortlist is fixed.' })
  }
}
