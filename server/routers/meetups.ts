import {
  createMeetup,
  fairAreas,
  getMeetup,
  joinMeetup,
  listMyMeetups,
  previewMeetup,
  setMyStart,
} from '../meetups/meetups.js'
import { createMeetupInput, fairAreasInput, meetupIdInput, setStartInput } from '../../shared/schemas.js'
import { meetupChangeProcedure, protectedProcedure, router } from '../trpc.js'

export const meetupsRouter = router({
  create: protectedProcedure
    .input(createMeetupInput)
    .mutation(({ ctx, input }) => createMeetup(ctx.db, input, ctx.user.id)),
  listMine: protectedProcedure.query(({ ctx }) => listMyMeetups(ctx.db, ctx.user.id)),
  preview: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => previewMeetup(ctx.db, input.meetupId, ctx.user.id)),
  join: meetupChangeProcedure
    .input(meetupIdInput)
    .mutation(({ ctx, input }) => joinMeetup(ctx.db, input.meetupId, ctx.user.id)),
  get: protectedProcedure
    .input(meetupIdInput)
    .query(({ ctx, input }) => getMeetup(ctx.db, input.meetupId, ctx.user.id)),
  setMyStart: meetupChangeProcedure
    .input(setStartInput)
    .mutation(({ ctx, input }) => setMyStart(ctx.db, ctx.towns, input, ctx.user.id)),
  fairAreas: protectedProcedure
    .input(fairAreasInput)
    .query(({ ctx, input }) => fairAreas(ctx.db, ctx.towns, input, ctx.user.id)),
})
