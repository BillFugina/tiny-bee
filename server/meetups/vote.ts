import { createHash, randomBytes } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { and, count, eq, sql } from 'drizzle-orm'
import { instantRunoff, type InstantRunoffResult } from '../../domain/index.js'
import { VOTING_MAX_DAYS } from '../../shared/schemas.js'
import type { Db } from '../db/client.js'
import { ballot, ballotReceipt, meetup, meetupMember } from '../db/schema.js'
import { getMeetupState, requireMember, requireOrganizer } from './members.js'
import { listItems } from './shortlist.js'
import { rows } from './sql.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Everything the vote card needs. Closes a vote whose deadline has passed. */
export async function voteStatus(db: Db, meetupId: string, userId: string, now = new Date()) {
  const { role } = await requireMember(db, meetupId, userId)
  let state = await getMeetupState(db, meetupId)
  if (state.phase === 'voting' && state.votingDeadline && state.votingDeadline <= now) {
    await closeVoting(db, meetupId)
    state = await getMeetupState(db, meetupId)
  }

  const items = await listItems(db, meetupId)
  const [members, voted, mine] = await Promise.all([
    countRows(db, meetupMember, eq(meetupMember.meetupId, meetupId)),
    countRows(db, ballotReceipt, eq(ballotReceipt.meetupId, meetupId)),
    countRows(db, ballotReceipt, and(eq(ballotReceipt.meetupId, meetupId), eq(ballotReceipt.userId, userId))),
  ])

  let result = state.result
  if (state.phase === 'decided' && !result) result = await storeResult(db, meetupId)

  const isOrganizer = role === 'organizer'
  return {
    phase: state.phase,
    deadline: state.votingDeadline,
    isOrganizer,
    iVoted: mine > 0,
    turnout: { voted, members },
    candidates: items.map((item) => ({ id: item.id, label: item.label })),
    canOpen: isOrganizer && state.phase === 'planning' && items.length >= 2,
    canClose: isOrganizer && state.phase === 'voting',
    result: result ? present(result, new Map(items.map((item) => [item.id, item.label]))) : null,
  }
}

export async function openVoting(
  db: Db,
  input: { meetupId: string; deadline: Date | null },
  userId: string,
  now = new Date(),
) {
  await requireOrganizer(db, input.meetupId, userId)
  if (input.deadline) {
    if (input.deadline.getTime() <= now.getTime()) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick a deadline in the future.' })
    }
    if (input.deadline.getTime() - now.getTime() > VOTING_MAX_DAYS * DAY_MS) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Voting can stay open ${VOTING_MAX_DAYS} days at most.` })
    }
  }
  const tooFew = () => new TRPCError({ code: 'BAD_REQUEST', message: 'Shortlist at least two places before voting.' })
  if ((await listItems(db, input.meetupId)).length < 2) throw tooFew()

  // Shortlist writes hold a share lock on the meetup row, so this update waits
  // for any in flight and every later one sees the new phase and stops.
  const [opened] = await db
    .update(meetup)
    .set({ phase: 'voting', votingDeadline: input.deadline })
    .where(and(eq(meetup.id, input.meetupId), eq(meetup.phase, 'planning')))
    .returning({ id: meetup.id })
  if (!opened) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting has already started.' })

  // A removal that landed while this waited could leave too few places. The
  // shortlist is settled now, so check again and undo if so.
  if ((await listItems(db, input.meetupId)).length < 2) {
    await db.execute(sql`
      update ${meetup} set phase = 'planning', voting_deadline = null
      where id = ${input.meetupId} and phase = 'voting'
        and not exists (select 1 from ${ballotReceipt} where meetup_id = ${input.meetupId})
    `)
    throw tooFew()
  }
  return { opened: true }
}

/**
 * Casts a new ballot, or changes one when the voter brings its token. Returns
 * the token, which is the only way back to the ballot: the server keeps just
 * its hash, and no member id.
 */
export async function castBallot(
  db: Db,
  input: { meetupId: string; ranking: string[]; token?: string | undefined },
  userId: string,
) {
  await requireMember(db, input.meetupId, userId)
  const items = new Set((await listItems(db, input.meetupId)).map((item) => item.id))
  if (input.ranking.some((id) => !items.has(id))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rank only places on the shortlist.' })
  }
  const ranking = JSON.stringify(input.ranking)

  if (input.token) {
    // One statement, so it can't land after voting closes. FOR SHARE makes a
    // concurrent close wait for this write, or this write see the close.
    const changed = await rows(
      db.execute(sql`
        with open_vote as (
          select id from ${meetup}
          where id = ${input.meetupId} and phase = 'voting'
            and (voting_deadline is null or voting_deadline > now())
          for share
        )
        update ${ballot} set ranking = ${ranking}::jsonb
        from open_vote
        where ${ballot.meetupId} = open_vote.id and ${ballot.tokenHash} = ${hashToken(input.token)}
        returning ${ballot.id}
      `),
    )
    if (changed.length === 0) {
      await explainClosed(db, input.meetupId)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'That ballot token does not match a ballot here.' })
    }
    return { token: input.token, changed: true }
  }

  const token = randomBytes(24).toString('base64url')
  // Receipt and ballot in one statement: both land or neither does.
  const cast = await rows(
    db.execute(sql`
      with open_vote as (
        select id from ${meetup}
        where id = ${input.meetupId} and phase = 'voting'
          and (voting_deadline is null or voting_deadline > now())
        for share
      ),
      receipt as (
        insert into ${ballotReceipt} (meetup_id, user_id)
        select id, ${userId} from open_vote
        on conflict do nothing
        returning meetup_id
      )
      insert into ${ballot} (meetup_id, token_hash, ranking)
      select meetup_id, ${hashToken(token)}, ${ranking}::jsonb from receipt
      returning id
    `),
  )
  if (cast.length === 0) {
    await explainClosed(db, input.meetupId)
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'You have already voted. Change your ballot from the browser you voted in.',
    })
  }

  await closeIfEveryoneVoted(db, input.meetupId)
  return { token, changed: false }
}

/** The ranking behind a token, so a voter can see and change what they cast. */
export async function myBallot(db: Db, input: { meetupId: string; token: string }, userId: string) {
  await requireMember(db, input.meetupId, userId)
  const [found] = await db
    .select({ ranking: ballot.ranking })
    .from(ballot)
    .where(and(eq(ballot.meetupId, input.meetupId), eq(ballot.tokenHash, hashToken(input.token))))
  return found ? { ranking: found.ranking } : null
}

export async function closeVotingAsOrganizer(db: Db, meetupId: string, userId: string) {
  await requireOrganizer(db, meetupId, userId)
  const closed = await closeVoting(db, meetupId)
  if (!closed) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting is not open.' })
  return { closed: true }
}

/** Ends voting and stores the count. Safe to call twice; only the first call closes. */
export async function closeVoting(db: Db, meetupId: string): Promise<boolean> {
  const [closed] = await db
    .update(meetup)
    .set({ phase: 'decided', decidedAt: new Date() })
    .where(and(eq(meetup.id, meetupId), eq(meetup.phase, 'voting')))
    .returning({ id: meetup.id })
  if (!closed) return false
  await storeResult(db, meetupId)
  return true
}

/** Counts the ballots and saves the rounds. Ballots can't change once decided, so this is repeatable. */
async function storeResult(db: Db, meetupId: string): Promise<InstantRunoffResult> {
  const candidates = (await listItems(db, meetupId)).map((item) => item.id)
  const ballots = await db.select({ ranking: ballot.ranking }).from(ballot).where(eq(ballot.meetupId, meetupId))
  const result = instantRunoff(
    candidates,
    ballots.map((b) => b.ranking),
  )
  await db.update(meetup).set({ result }).where(eq(meetup.id, meetupId))
  return result
}

async function closeIfEveryoneVoted(db: Db, meetupId: string) {
  const [members, voted] = await Promise.all([
    countRows(db, meetupMember, eq(meetupMember.meetupId, meetupId)),
    countRows(db, ballotReceipt, eq(ballotReceipt.meetupId, meetupId)),
  ])
  if (voted >= members) await closeVoting(db, meetupId)
}

async function explainClosed(db: Db, meetupId: string) {
  const state = await getMeetupState(db, meetupId)
  if (state.phase === 'planning') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting has not opened yet.' })
  }
  if (state.phase === 'decided' || (state.votingDeadline && state.votingDeadline <= new Date())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voting has closed.' })
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type CountTable = typeof meetupMember | typeof ballotReceipt
async function countRows(db: Db, table: CountTable, where: ReturnType<typeof and>) {
  const [row] = await db.select({ n: count() }).from(table).where(where)
  return row?.n ?? 0
}

/** The stored count with places named, for the round-by-round reveal. */
function present(result: InstantRunoffResult, labels: Map<string, string>) {
  const name = (id: string | null) => (id === null ? null : (labels.get(id) ?? 'A removed place'))
  return {
    winner: result.winner === null ? null : { id: result.winner, label: name(result.winner)! },
    rounds: result.rounds.map((round) => ({
      number: round.number,
      active: round.active,
      exhausted: round.exhausted,
      tallies: Object.entries(round.tallies)
        .map(([id, votes]) => ({ id, label: name(id)!, votes }))
        .sort((a, b) => b.votes - a.votes),
      eliminated: name(round.eliminated),
      winner: name(round.winner),
      reason: round.reason.kind,
      tieBrokenByRound: round.reason.kind === 'tie-broken-by-earlier-round' ? round.reason.round : null,
    })),
  }
}
