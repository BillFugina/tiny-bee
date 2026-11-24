import { neon } from '@neondatabase/serverless'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import * as schema from './schema.js'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/**
 * Neon's HTTP driver is the right fit inside Vercel functions (no pooled TCP
 * connections to manage). Anywhere else (local Postgres, CI) we use
 * node-postgres. Both are Drizzle PgDatabase instances, so callers never care.
 */
export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

export function createDb(url: string): Db {
  if (isNeonUrl(url)) {
    return drizzleNeonHttp({ client: neon(url), schema }) as unknown as Db
  }
  return drizzleNodePg({ client: new pg.Pool({ connectionString: url, max: 5 }), schema }) as unknown as Db
}

let cached: Db | undefined

export function db(): Db {
  cached ??= createDb(env().DATABASE_URL)
  return cached
}

export { schema }
