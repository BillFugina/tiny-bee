import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'
import type { PlannerConfig, PlannerModel } from './agent/model.js'
import { afterResponse, type LiveUpdates } from './live/live.js'
import type { Db } from './db/client.js'
import type { EmailSender } from './email/email.js'
import type { TownDirectory } from './places/directory.js'

export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface Context {
  db: Db
  user: SessionUser | null
  towns: TownDirectory
  /** The planner agent, or null when no API key is set. */
  planner?: { model: PlannerModel; config: PlannerConfig } | null
  /** This deployment's public origin, for links the planner hands out. */
  origin?: string | null
  /** Tells other members' open pages to refresh. Absent in tests. */
  live?: LiveUpdates
  /** Sends invite emails. Absent in tests that don't need it. */
  email?: EmailSender
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

/**
 * For changes others in the meetup should see: once the change succeeds,
 * everyone with the meetup open is told to refresh, without holding up the
 * response. The input's meetupId has
 * already passed validation and the procedure's own membership check by then.
 */
export const meetupChangeProcedure = protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
  const result = await next()
  if (result.ok && ctx.live) {
    const input = (await getRawInput()) as { meetupId?: unknown } | undefined
    if (typeof input?.meetupId === 'string') await afterResponse(ctx.live.publishChange(input.meetupId))
  }
  return result
})
