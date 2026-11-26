import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

// Same origin as the app: /api/auth is proxied locally and rewritten on Vercel.
// oauthProviderClient carries an agent's signed sign-in request (the page's
// query) through sign-in and consent, so the agent connection can finish.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [magicLinkClient(), oauthProviderClient()],
})

/** True on /sign-in and /consent when an agent sent the member here to connect. */
export function isAgentSignIn(params: URLSearchParams): boolean {
  return params.has('client_id') && params.has('sig')
}

/** Better Auth answers {redirect, url} when the agent flow should move on. */
export function agentRedirect(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const { redirect, url } = data as { redirect?: unknown; url?: unknown }
  return redirect === true && typeof url === 'string' ? url : null
}
