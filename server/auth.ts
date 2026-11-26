import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { mcp } from '@better-auth/mcp'
import { jwt, magicLink } from 'better-auth/plugins'
import { db, schema } from './db/client.js'
import { appOrigin, env, trustedOrigins } from './env.js'

function createAuth() {
  const e = env()
  const origin = appOrigin(e)
  return betterAuth({
    secret: e.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: '/api/auth',
    trustedOrigins: trustedOrigins(e),
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        jwks: schema.jwks,
        oauthClient: schema.oauthClient,
        oauthResource: schema.oauthResource,
        oauthClientResource: schema.oauthClientResource,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
        oauthClientAssertion: schema.oauthClientAssertion,
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
      // Signing keys for the access tokens below.
      jwt(),
      // tiny-bee as an OAuth 2.1 server for members' own agents: an MCP
      // client registers itself, the member signs in and approves it on
      // /consent, and the agent gets a token that acts as that member at
      // /api/mcp and nowhere else.
      mcp({
        resource: mcpResource(origin),
        loginPage: '/sign-in',
        consentPage: '/consent',
        scopes: ['openid', 'profile', 'email', 'offline_access', MCP_SCOPE],
        // MCP clients register themselves (RFC 7591); that's how agents like
        // Claude connect without anyone setting them up by hand. A client gets
        // nothing until a member signs in and approves it.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Desktop and command-line agents (Claude Code, Codex and the like)
        // get their code back on a local port, http://localhost:PORT/callback
        // (RFC 8252), and most register without saying they're native apps.
        // Loopback stays on the member's own machine and every code is
        // PKCE-bound, so allow it; any other http redirect is still refused.
        allowInsecureRedirectUri: (url) => LOOPBACK_HOSTS.has(url.hostname),
      }),
    ],
  })
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The one scope an agent needs: act as the member in their meetups, through MCP. */
export const MCP_SCOPE = 'meetups'

/** The MCP endpoint's URL, which every agent token is bound to. */
export function mcpResource(origin: string): string {
  return `${origin}/api/mcp`
}

export type Auth = ReturnType<typeof createAuth>

let cached: Auth | undefined

export function auth(): Auth {
  cached ??= createAuth()
  return cached
}
