import { z } from 'zod'

// Zod schemas shared by the browser (TanStack Form) and the server (tRPC input),
// so both sides validate the same way. Keep this file free of server-only imports.

export const createMeetupInput = z.object({
  title: z.string().trim().min(3, 'Give it at least 3 characters').max(120),
})
export type CreateMeetupInput = z.infer<typeof createMeetupInput>
