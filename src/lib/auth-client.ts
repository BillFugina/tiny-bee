import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

// Same origin as the app: /api/auth is proxied locally and rewritten on Vercel.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
})
