import { publicProcedure, router } from '../trpc.js'
import { meetupsRouter } from './meetups.js'

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const, time: new Date() })),
  me: publicProcedure.query(({ ctx }) => ctx.user),
  meetups: meetupsRouter,
})

export type AppRouter = typeof appRouter
