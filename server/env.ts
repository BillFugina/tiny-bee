import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  // Optional: defaults to the Vercel deployment URL, or localhost in dev.
  BETTER_AUTH_URL: z.url().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  // Optional: without a key the app runs and the planner chat says it's off.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  PLANNER_MODEL: z.string().min(1).optional(),
  PLANNER_EFFORT: z.enum(['low', 'medium', 'high']).optional(),
  // Optional: without a key, pages don't refresh by themselves when others make changes.
  ABLY_API_KEY: z.string().min(1).optional(),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/** Reads and validates server env vars once, on first use (not at import time). */
export function env(): Env {
  cached ??= schema.parse(process.env)
  return cached
}

/** The public origin this deployment answers on. */
export function appOrigin(e: Env = env()): string {
  if (e.BETTER_AUTH_URL) return e.BETTER_AUTH_URL
  if (e.VERCEL_ENV === 'production' && e.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (e.VERCEL_BRANCH_URL) return `https://${e.VERCEL_BRANCH_URL}`
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`
  return 'http://localhost:5173'
}

/**
 * Every origin this deployment can be opened on. A Vercel preview answers on
 * its branch URL and on its own per-deployment URL, and Better Auth rejects
 * sign-ups from any origin it doesn't trust ("Invalid origin"), so all of them
 * are trusted, plus BETTER_AUTH_URL if set. Only this project's own URLs: never
 * a wildcard like *.vercel.app, which anyone can deploy to.
 */
export function trustedOrigins(e: Env = env()): string[] {
  const hosts = [e.VERCEL_BRANCH_URL, e.VERCEL_URL, e.VERCEL_PROJECT_PRODUCTION_URL]
  const origins = [
    appOrigin(e),
    ...(e.BETTER_AUTH_URL ? [new URL(e.BETTER_AUTH_URL).origin] : []),
    ...hosts.filter((h): h is string => Boolean(h)).map((h) => `https://${h}`),
  ]
  return [...new Set(origins.map((o) => new URL(o).origin))]
}
