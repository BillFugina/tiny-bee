import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { DEFAULT_PLANNER } from './agent/checkin.js'
import { anthropicPlanner, type PlannerModel } from './agent/model.js'
import { auth } from './auth.js'
import { lazyDb } from './db/client.js'
import { env } from './env.js'
import { towns } from './places/towns.js'
import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

/**
 * Web-standard (Request -> Response) handlers. Vercel functions in api/ and the
 * local dev server both call these, so local dev runs the same code as deploys.
 */

export async function handleAuth(request: Request): Promise<Response> {
  try {
    return await auth().handler(request)
  } catch (error) {
    console.error('[auth] request failed:', error)
    return Response.json(
      { message: 'Sign-in is not working on the server right now. The function log has details.' },
      { status: 500 },
    )
  }
}

export async function createContext(request: Request): Promise<Context> {
  let user: Context['user'] = null
  try {
    const session = await auth().api.getSession({ headers: request.headers })
    if (session) user = { id: session.user.id, email: session.user.email, name: session.user.name }
  } catch (error) {
    // Misconfigured auth shouldn't take down public procedures like health.
    console.error('[auth] session lookup failed:', error)
  }
  return { db: lazyDb, user, towns: towns(), planner: planner() }
}

let plannerModel: { key: string; model: PlannerModel } | undefined

/** The planner, built once per function instance, or null when no API key is set. */
function planner(): Context['planner'] {
  let e: ReturnType<typeof env>
  try {
    e = env()
  } catch {
    return null // Misconfigured env shows up in auth and the database; don't fail here too.
  }
  if (!e.ANTHROPIC_API_KEY) return null
  if (plannerModel?.key !== e.ANTHROPIC_API_KEY) {
    plannerModel = { key: e.ANTHROPIC_API_KEY, model: anthropicPlanner(e.ANTHROPIC_API_KEY) }
  }
  return {
    model: plannerModel.model,
    config: { model: e.PLANNER_MODEL ?? DEFAULT_PLANNER.model, effort: e.PLANNER_EFFORT ?? DEFAULT_PLANNER.effort },
  }
}

export function handleTrpc(request: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createContext(request),
    onError({ path, error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') console.error(`[trpc] ${path ?? '?'}:`, error)
    },
  })
}
