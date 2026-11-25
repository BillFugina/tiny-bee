/**
 * Applies the SQL migrations in drizzle/ to DATABASE_URL.
 *
 * Uses node-postgres for every target (local, CI and Neon all accept plain
 * Postgres connections). On Vercel this runs in the build step, so each preview
 * deploy migrates its own Neon branch before the app goes live.
 *
 *   npm run db:migrate             # fails if DATABASE_URL is missing
 *   tsx scripts/migrate.ts --if-configured   # skips quietly instead, except in a
 *                                            # Vercel preview or production build,
 *                                            # where a missing database fails the build
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { migrationPlan } from './migrate-plan.js'

const plan = migrationPlan(process.env, process.argv)
if (plan.action === 'run') {
  const pool = new pg.Pool({ connectionString: plan.url, max: 1 })
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' })
    console.info('[migrate] database is up to date.')
  } finally {
    await pool.end()
  }
} else if (plan.action === 'skip') {
  console.info(plan.message)
} else {
  console.error(plan.message)
  process.exitCode = 1
}
