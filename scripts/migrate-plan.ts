/** Decides what the migration script does, kept apart so it can be tested without a database. */

export type MigrationPlan = { action: 'run'; url: string } | { action: 'skip' | 'fail'; message: string }

export function migrationPlan(env: NodeJS.ProcessEnv, argv: readonly string[]): MigrationPlan {
  const url = env.DATABASE_URL
  if (url) return { action: 'run', url }

  // A preview or production deploy without a database would go live unmigrated, so stop the build.
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'production') {
    return {
      action: 'fail',
      message: `[migrate] This ${env.VERCEL_ENV} build has no DATABASE_URL. Check that Neon's Vercel integration covers ${env.VERCEL_ENV} deployments, then redeploy.`,
    }
  }

  if (argv.includes('--if-configured')) {
    return { action: 'skip', message: '[migrate] DATABASE_URL not set; skipping migrations.' }
  }
  return { action: 'fail', message: '[migrate] DATABASE_URL is required.' }
}
