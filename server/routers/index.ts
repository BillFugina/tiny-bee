import { checkHealth } from '../health.js'
import { publicProcedure, router } from '../trpc.js'
import { checkinRouter } from './checkin.js'
import { meetupsRouter } from './meetups.js'
import { placesRouter } from './places.js'
import { shortlistRouter } from './shortlist.js'
import { voteRouter } from './vote.js'

export const appRouter = router({
  health: publicProcedure.query(checkHealth),
  checkin: checkinRouter,
  me: publicProcedure.query(({ ctx }) => ctx.user),
  meetups: meetupsRouter,
  places: placesRouter,
  shortlist: shortlistRouter,
  vote: voteRouter,
})

export type AppRouter = typeof appRouter
