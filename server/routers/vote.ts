import { castBallot, closeVotingAsOrganizer, myBallot, openVoting, voteStatus } from '../meetups/vote.js'
import { castBallotInput, meetupIdInput, myBallotInput, openVotingInput } from '../../shared/schemas.js'
import { meetupChangeProcedure, protectedProcedure, router } from '../trpc.js'

export const voteRouter = router({
  status: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => voteStatus(ctx.db, input.meetupId, ctx.user.id)),
  open: meetupChangeProcedure
    .input(openVotingInput)
    .mutation(({ ctx, input }) => openVoting(ctx.db, input, ctx.user.id)),
  cast: meetupChangeProcedure
    .input(castBallotInput)
    .mutation(({ ctx, input }) => castBallot(ctx.db, input, ctx.user.id)),
  mine: protectedProcedure.input(myBallotInput).query(({ ctx, input }) => myBallot(ctx.db, input, ctx.user.id)),
  close: meetupChangeProcedure
    .input(meetupIdInput)
    .mutation(({ ctx, input }) => closeVotingAsOrganizer(ctx.db, input.meetupId, ctx.user.id)),
})
