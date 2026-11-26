import { checkinHistory, sendCheckin } from '../agent/checkin.js'
import { checkinSendInput, meetupIdInput } from '../../shared/schemas.js'
import { meetupChangeProcedure, protectedProcedure, router } from '../trpc.js'

export const checkinRouter = router({
  /** This member's own check-in. There is no way to ask for anyone else's. */
  history: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => checkinHistory(ctx.db, input.meetupId, ctx.user.id, Boolean(ctx.planner))),
  // The planner can set the member's start or add to the shortlist mid-chat.
  send: meetupChangeProcedure
    .input(checkinSendInput)
    .mutation(({ ctx, input }) =>
      sendCheckin(ctx.db, ctx.towns, ctx.planner ?? null, input, ctx.user.id, ctx.origin ?? null),
    ),
})
