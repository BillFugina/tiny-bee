import { addItem, removeItem, viewShortlist } from '../meetups/shortlist.js'
import { addToShortlistInput, meetupIdInput, shortlistItemInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

export const shortlistRouter = router({
  list: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => viewShortlist(ctx.db, input.meetupId, ctx.user.id)),
  add: protectedProcedure
    .input(addToShortlistInput)
    .mutation(({ ctx, input }) => addItem(ctx.db, ctx.towns, input, ctx.user.id)),
  remove: protectedProcedure
    .input(shortlistItemInput)
    .mutation(({ ctx, input }) => removeItem(ctx.db, input, ctx.user.id)),
})
