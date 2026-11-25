import { TRPCError } from '@trpc/server'
import { and, asc, eq, sql } from 'drizzle-orm'
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

  // One statement: take a slot on the meetup row, then insert. The update locks
  // the row and rechecks phase and count against its latest version, so
  // concurrent adds, removals and opening voting run one after another. A
  // duplicate town fails the insert, which undoes the slot too.
  let added: { id: string; label: string } | undefined
  try {
    ;[added] = await rows<{ id: string; label: string }>(
      db.execute(sql`
        with slot as (
          update ${meetup} set shortlist_count = shortlist_count + 1
          where id = ${input.meetupId} and phase = 'planning' and shortlist_count < ${SHORTLIST_MAX}
          returning id
        )
        insert into ${shortlistItem} (meetup_id, town_id, label, lat, lng, note, added_by)
        select id, ${town.id}, ${townLabel(town)}, ${town.lat}, ${town.lng}, ${input.note || null}, ${userId}
        from slot
        returning id, label
      `),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TRPCError({ code: 'CONFLICT', message: `${townLabel(town)} is already on the shortlist.` })
    }
    throw err
  }
  if (!added) {
    await requirePlanning(db, input.meetupId)
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
  // Lock the meetup row while it is in planning, delete, and give the slot back,
  // all in one statement. A removal that lost a race deletes nothing and
  // returns nothing, so the count stays right.
  const removed = await rows(
    db.execute(sql`
      with planning as (
        select id from ${meetup} where id = ${input.meetupId} and phase = 'planning' for update
      ),
      gone as (
        delete from ${shortlistItem} using planning
        where ${shortlistItem.id} = ${input.itemId} and ${shortlistItem.meetupId} = planning.id
        returning ${shortlistItem.meetupId} as meetup_id
      )
      update ${meetup} set shortlist_count = shortlist_count - 1
      from gone where ${meetup.id} = gone.meetup_id
      returning ${meetup.id}
    `),
  )
  if (removed.length === 0) await requirePlanning(db, input.meetupId)
  return { removed: true }
}

/** Postgres unique violation, from node-postgres or Neon, possibly wrapped by Drizzle. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 3; i++) {
    if (e.code === '23505') return true
    e = e.cause as typeof e
  }
  return false
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
