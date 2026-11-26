import { z } from 'zod'

// Zod schemas shared by the browser (TanStack Form) and the server (tRPC input),
// so both sides validate the same way. Keep this file free of server-only imports.

export const createMeetupInput = z.object({
  title: z.string().trim().min(3, 'Give it at least 3 characters').max(120),
})
export type CreateMeetupInput = z.infer<typeof createMeetupInput>

export const meetupIdInput = z.object({ meetupId: z.uuid() })

/** How long a drive a member can set, in minutes. */
export const DRIVE_LIMIT = { min: 15, max: 600 } as const

export const startFields = z.object({
  townId: z.number().int().positive('Pick a town from the list'),
  maxMinutes: z
    .number('Enter a number of minutes')
    .int('Whole minutes only')
    .min(DRIVE_LIMIT.min, `At least ${DRIVE_LIMIT.min} minutes`)
    .max(DRIVE_LIMIT.max, `At most ${DRIVE_LIMIT.max / 60} hours`),
})
export const setStartInput = meetupIdInput.extend(startFields.shape)
export type SetStartInput = z.infer<typeof setStartInput>

export const fairAreasInput = meetupIdInput.extend({
  /** 0 ranks by the longest single trip, 1 by the average trip. */
  averageWeight: z.number().min(0).max(1).default(0),
})

export const townSearchInput = z.object({ q: z.string().trim().min(2).max(80) })

/** Most places a shortlist can hold, so a ballot stays quick to rank. */
export const SHORTLIST_MAX = 8
/** Longest a vote can stay open. */
export const VOTING_MAX_DAYS = 30

export const shortlistNoteField = z.string().trim().max(200, 'Keep the note under 200 characters')

export const addToShortlistInput = meetupIdInput.extend({
  townId: z.number().int().positive(),
  note: shortlistNoteField.optional(),
})

export const shortlistItemInput = meetupIdInput.extend({ itemId: z.uuid() })

export const openVotingFields = z.object({
  /** Null leaves voting open until the organizer closes it or everyone has voted. */
  deadline: z.date().nullable(),
})
export const openVotingInput = meetupIdInput.extend(openVotingFields.shape)

/** A ballot token: random, handed to the voter once, never stored in the clear. */
export const ballotToken = z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Not a ballot token')

export const castBallotInput = meetupIdInput.extend({
  /** Shortlist item ids, best first. Ranking only some is fine. */
  ranking: z
    .array(z.uuid())
    .min(1, 'Rank at least one place')
    .max(SHORTLIST_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Each place can be ranked once'),
  /** Present when changing a ballot already cast. */
  token: ballotToken.optional(),
})

export const myBallotInput = meetupIdInput.extend({ token: ballotToken })

/** Longest message a member can send the planner. */
export const CHECKIN_TEXT_MAX = 2000

export const checkinSendInput = meetupIdInput.extend({
  text: z.string().trim().min(1, 'Say something first').max(CHECKIN_TEXT_MAX, 'Keep it under 2,000 characters'),
})

/** How many addresses one invite form can take at once. */
export const INVITE_BATCH_MAX = 10

export const inviteEmailsField = z
  .array(z.email('That doesn’t look like an email address').trim().toLowerCase().max(254))
  .min(1, 'Add at least one email address')
  .max(INVITE_BATCH_MAX, `Up to ${INVITE_BATCH_MAX} addresses at a time`)

export const sendInvitesInput = meetupIdInput.extend({ emails: inviteEmailsField })
export type SendInvitesInput = z.infer<typeof sendInvitesInput>
