import { listInvites, sendInvites } from '../meetups/invites.js'
import { meetupIdInput, sendInvitesInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

export const invitesRouter = router({
  /** Whether this server really emails invites (it doesn't without a Resend key). */
  available: protectedProcedure.query(({ ctx }) => ({ available: Boolean(ctx.email?.delivers && ctx.origin) })),
  /** Addresses invited by email and whether they've joined. */
  list: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => listInvites(ctx.db, input.meetupId, ctx.user.id)),
  send: protectedProcedure
    .input(sendInvitesInput)
    .mutation(({ ctx, input }) => sendInvites(ctx.db, ctx.email, ctx.origin, input, ctx.user)),
})
