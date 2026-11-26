import { checkHealth } from '../health.js'
import { publicProcedure, router } from '../trpc.js'
import { checkinRouter } from './checkin.js'
import { invitesRouter } from './invites.js'
import { liveRouter } from './live.js'
import { meetupsRouter } from './meetups.js'
import { placesRouter } from './places.js'
import { shortlistRouter } from './shortlist.js'
import { voteRouter } from './vote.js'

export const appRouter = router({
  health: publicProcedure.query(checkHealth),
  checkin: checkinRouter,
  /** Whether this server really sends email. Without a Resend key, sign-in links only go to the server log. */
  email: publicProcedure.query(({ ctx }) => ({ delivers: Boolean(ctx.email?.delivers) })),
  invites: invitesRouter,
  live: liveRouter,
  me: publicProcedure.query(({ ctx }) => ctx.user),
  meetups: meetupsRouter,
  places: placesRouter,
  shortlist: shortlistRouter,
  vote: voteRouter,
})

export type AppRouter = typeof appRouter
