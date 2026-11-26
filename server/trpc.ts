import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'
import type { PlannerConfig, PlannerModel } from './agent/model.js'
import type { Db } from './db/client.js'
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
