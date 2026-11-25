import { checkHealth } from '../health.js'
import { publicProcedure, router } from '../trpc.js'
import { meetupsRouter } from './meetups.js'
import { placesRouter } from './places.js'

export const appRouter = router({
  health: publicProcedure.query(checkHealth),
  me: publicProcedure.query(({ ctx }) => ctx.user),
  meetups: meetupsRouter,
  places: placesRouter,
})

export type AppRouter = typeof appRouter
