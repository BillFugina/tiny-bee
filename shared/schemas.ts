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
