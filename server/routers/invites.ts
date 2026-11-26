import { sendInvites } from '../meetups/invites.js'
import { sendInvitesInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

export const invitesRouter = router({
  /** Whether this server really emails invites (it doesn't without a Resend key). */
  available: protectedProcedure.query(({ ctx }) => ({ available: Boolean(ctx.email?.delivers && ctx.origin) })),
  send: protectedProcedure
    .input(sendInvitesInput)
    .mutation(({ ctx, input }) => sendInvites(ctx.db, ctx.email, ctx.origin, input, ctx.user)),
})
