import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { db, schema } from './db/client.js'
import { appOrigin, env } from './env.js'

function createAuth() {
  const e = env()
  const origin = appOrigin(e)
  return betterAuth({
    secret: e.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: '/api/auth',
    trustedOrigins: [origin],
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    // Email and password works with no third-party services, so every preview
    // deploy can sign in on day one.
    emailAndPassword: { enabled: true },
    plugins: [
      magicLink({
        // No email provider is wired yet. Until one is (planned: Resend on a
        // personal account), the link is written to the function log so it can
        // be tested from the Vercel dashboard or the local terminal.
        sendMagicLink: async ({ email, url }) => {
          console.info(`[auth] magic link for ${email}: ${url}`)
        },
      }),
      // Later: Better Auth's MCP plugin as the OAuth server for members' agents.
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let cached: Auth | undefined

export function auth(): Auth {
  cached ??= createAuth()
  return cached
}
