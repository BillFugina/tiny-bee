import { meetupIdInput } from '../../shared/schemas.js'
import { requireMember } from '../meetups/members.js'
import { protectedProcedure, router } from '../trpc.js'

export const liveRouter = router({
  /**
   * A subscribe-only token for one meetup the caller is in, or null when live
   * updates are off. Members only: requireMember throws for anyone else.
   */
  token: protectedProcedure.input(meetupIdInput).query(async ({ ctx, input }) => {
    await requireMember(ctx.db, input.meetupId, ctx.user.id)
    return ctx.live ? ctx.live.subscribeToken(input.meetupId) : null
  }),
})
