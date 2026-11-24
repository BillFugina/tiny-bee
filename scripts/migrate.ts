/**
 * Applies the SQL migrations in drizzle/ to DATABASE_URL.
 *
 * Uses node-postgres for every target (local, CI and Neon all accept plain
 * Postgres connections). On Vercel this runs in the build step, so each preview
 * deploy migrates its own Neon branch before the app goes live.
 *
 *   npm run db:migrate             # fails if DATABASE_URL is missing
 *   tsx scripts/migrate.ts --if-configured   # skips quietly instead
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  if (process.argv.includes('--if-configured')) {
    console.info('[migrate] DATABASE_URL not set; skipping migrations.')
    process.exit(0)
  }
  console.error('[migrate] DATABASE_URL is required.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' })
  console.info('[migrate] database is up to date.')
} finally {
  await pool.end()
}
