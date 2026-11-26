import { TRPCError } from '@trpc/server'
import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { meetupInvite, meetupMember, user } from '../db/schema.js'
import type { EmailSender } from '../email/email.js'
import { inviteEmail } from '../email/messages.js'
import type { SendInvitesInput } from '../../shared/schemas.js'
import { getMeetupState, requireMember } from './members.js'

/** One address isn't emailed about the same meetup more than once in this window. */
export const INVITE_REPEAT_HOURS = 24
/** The most invites one member can send in a day, across all their meetups. */
export const INVITES_PER_DAY = 20

export type InviteStatus = 'sent' | 'already_member' | 'already_invited' | 'limit' | 'failed'

export interface InviteResult {
  email: string
  status: InviteStatus
}

/**
 * Emails an invite link to each address. Members only. Skips people already in
 * the meetup and addresses invited in the last day, and stops at the daily
 * limit, so the form can't be used to send mail in bulk from tiny-bee.
 */
export async function sendInvites(
  db: Db,
  email: EmailSender | undefined,
  origin: string | null | undefined,
  input: SendInvitesInput,
  sender: { id: string; name: string },
): Promise<InviteResult[]> {
  await requireMember(db, input.meetupId, sender.id)
  if (!email?.delivers || !origin) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Email invites are off on this server.' })
  }
  const meetup = await getMeetupState(db, input.meetupId)
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))]
  const since = new Date(Date.now() - INVITE_REPEAT_HOURS * 60 * 60 * 1000)

  const members = await db
    .select({ email: sql<string>`lower(${user.email})` })
    .from(meetupMember)
    .innerJoin(user, eq(user.id, meetupMember.userId))
    .where(and(eq(meetupMember.meetupId, input.meetupId), inArray(sql`lower(${user.email})`, emails)))
  const memberEmails = new Set(members.map((m) => m.email))

  const recent = await db
    .select({ email: meetupInvite.email })
    .from(meetupInvite)
    .where(
      and(
        eq(meetupInvite.meetupId, input.meetupId),
        inArray(meetupInvite.email, emails),
        gte(meetupInvite.createdAt, since),
      ),
    )
  const recentEmails = new Set(recent.map((r) => r.email))

  const [sentToday] = await db
    .select({ n: count() })
    .from(meetupInvite)
    .where(and(eq(meetupInvite.invitedBy, sender.id), gte(meetupInvite.createdAt, since)))
  let remaining = INVITES_PER_DAY - (sentToday?.n ?? 0)

  const url = `${origin}/m/${input.meetupId}`
  const results: InviteResult[] = []
  for (const address of emails) {
    if (memberEmails.has(address)) {
      results.push({ email: address, status: 'already_member' })
      continue
    }
    if (recentEmails.has(address)) {
      results.push({ email: address, status: 'already_invited' })
      continue
    }
    if (remaining <= 0) {
      results.push({ email: address, status: 'limit' })
      continue
    }
    // Recorded before sending, so a double click can't email twice; removed
    // again if the send fails, so the member can try that address again.
    const [row] = await db
      .insert(meetupInvite)
      .values({ meetupId: input.meetupId, invitedBy: sender.id, email: address })
      .returning({ id: meetupInvite.id })
    if (!row) {
      results.push({ email: address, status: 'failed' })
      continue
    }
    remaining--
    try {
      await email.send(
        inviteEmail({
          to: address,
          inviter: sender.name,
          title: meetup.title,
          url,
          idempotencyKey: `invite-${row.id}`,
        }),
      )
      results.push({ email: address, status: 'sent' })
    } catch (error) {
      console.error(`[invites] could not email an invite for meetup ${input.meetupId}:`, error)
      await db.delete(meetupInvite).where(eq(meetupInvite.id, row.id))
      remaining++
      results.push({ email: address, status: 'failed' })
    }
  }
  return results
}
