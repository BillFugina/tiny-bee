import { requireMcpAuth } from '@better-auth/mcp'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { DEFAULT_PLANNER } from './agent/checkin.js'
import { anthropicPlanner, type PlannerModel } from './agent/model.js'
import { auth, MCP_SCOPE, mcpResource } from './auth.js'
import { lazyDb } from './db/client.js'
import { appOrigin, env } from './env.js'
import { ablyLiveUpdates, noLiveUpdates, type LiveUpdates } from './live/live.js'
import { createMcpServer } from './mcp/server.js'
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
  return { db: lazyDb, user, towns: towns(), planner: planner(), origin: origin(), live: live() }
}

let liveUpdates: { key: string | undefined; live: LiveUpdates } | undefined

/** Ably when ABLY_API_KEY is set, built once per function instance; otherwise off. */
function live(): LiveUpdates {
  let key: string | undefined
  try {
    key = env().ABLY_API_KEY
  } catch {
    return noLiveUpdates // Misconfigured env shows up elsewhere.
  }
  if (liveUpdates && liveUpdates.key === key) return liveUpdates.live
  let built = noLiveUpdates
  if (key) {
    try {
      built = ablyLiveUpdates(key)
    } catch (error) {
      console.error('[live] ABLY_API_KEY is set but unusable:', error)
    }
  }
  liveUpdates = { key, live: built }
  return built
}

/** The public origin, or null when env is misconfigured (that shows up elsewhere). */
function origin(): string | null {
  try {
    return appOrigin()
  } catch {
    return null
  }
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

let mcpHandler: ((request: Request) => Promise<Response>) | undefined

/**
 * The MCP endpoint for members' own agents. requireMcpAuth checks the bearer
 * token (signature, issuer, bound to this endpoint, the meetups scope) and
 * answers 401 with a pointer to the OAuth metadata when there isn't one, which
 * is how an MCP client knows to send the member through sign-in. Stateless:
 * each request gets its own server, acting as the member the token names.
 */
export async function handleMcp(request: Request): Promise<Response> {
  try {
    mcpHandler ??= requireMcpAuth(
      auth(),
      async (req, claims) => {
        if (typeof claims.sub !== 'string' || !claims.sub) {
          return Response.json({ error: 'invalid_token' }, { status: 401 })
        }
        const server = createMcpServer({
          db: lazyDb,
          towns: towns(),
          userId: claims.sub,
          origin: origin(),
          live: live(),
        })
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        await server.connect(transport)
        return transport.handleRequest(req)
      },
      { resource: mcpResource(appOrigin()), requiredScopes: [MCP_SCOPE] },
    )
    return await mcpHandler(request)
  } catch (error) {
    console.error('[mcp] request failed:', error)
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'tiny-bee had a problem on the server.' }, id: null },
      { status: 500 },
    )
  }
}
