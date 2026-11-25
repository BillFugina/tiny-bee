import { TRPCError } from '@trpc/server'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { SHORTLIST_MAX } from '../../shared/schemas.js'
import type { Db } from '../db/client.js'
import { meetup, shortlistItem, user } from '../db/schema.js'
import { townLabel, type TownDirectory } from '../places/directory.js'
import { getMeetupState, requireMember } from './members.js'
import { rows } from './sql.js'

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
  if ((current?.n ?? 0) >= SHORTLIST_MAX) throw full()

  // One statement that only writes while the meetup is still in planning. The
  // share lock makes opening voting wait for it (see openVoting).
  const [added] = await rows<{ id: string; label: string }>(
    db.execute(sql`
      with planning as (
        select id from ${meetup} where id = ${input.meetupId} and phase = 'planning' for share
      )
      insert into ${shortlistItem} (meetup_id, town_id, label, lat, lng, note, added_by)
      select id, ${town.id}, ${townLabel(town)}, ${town.lat}, ${town.lng}, ${input.note || null}, ${userId}
      from planning
      on conflict (meetup_id, town_id) do nothing
      returning id, label
    `),
  )
  if (!added) {
    await requirePlanning(db, input.meetupId)
    throw new TRPCError({ code: 'CONFLICT', message: `${townLabel(town)} is already on the shortlist.` })
  }

  // Two adds at once can both pass the count above. Keep the earliest eight.
  const [position] = await rows<{ n: number | string }>(
    db.execute(sql`
      select count(*) as n from ${shortlistItem} s, ${shortlistItem} mine
      where mine.id = ${added.id} and s.meetup_id = mine.meetup_id
        and (s.created_at, s.id) <= (mine.created_at, mine.id)
    `),
  )
  if (Number(position?.n ?? 0) > SHORTLIST_MAX) {
    await db.delete(shortlistItem).where(eq(shortlistItem.id, added.id))
    throw full()
  }
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
  const removed = await rows(
    db.execute(sql`
      with planning as (
        select id from ${meetup} where id = ${input.meetupId} and phase = 'planning' for share
      )
      delete from ${shortlistItem} using planning
      where ${shortlistItem.id} = ${input.itemId} and ${shortlistItem.meetupId} = planning.id
      returning ${shortlistItem.id}
    `),
  )
  if (removed.length === 0) await requirePlanning(db, input.meetupId)
  return { removed: true }
}

function full() {
  return new TRPCError({ code: 'BAD_REQUEST', message: `The shortlist holds ${SHORTLIST_MAX} places at most.` })
}

async function requirePlanning(db: Db, meetupId: string) {
  const { phase } = await getMeetupState(db, meetupId)
  if (phase !== 'planning') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting has started, so the shortlist is fixed.' })
  }
}
