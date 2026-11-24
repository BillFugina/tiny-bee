import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { auth } from './auth.js'
import { db } from './db/client.js'
import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

/**
 * Web-standard (Request -> Response) handlers. Vercel functions in api/ and the
 * local dev server both call these, so local dev runs the same code as deploys.
 */

export function handleAuth(request: Request): Promise<Response> {
  return auth().handler(request)
}

export async function createContext(request: Request): Promise<Context> {
  const session = await auth().api.getSession({ headers: request.headers })
  return {
    db: db(),
    user: session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null,
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
