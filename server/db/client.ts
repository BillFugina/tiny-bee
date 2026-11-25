import { neon } from '@neondatabase/serverless'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'
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

/** The app's database. Reads DATABASE_URL on first use, not at import time. */
export function db(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    cached = createDb(url)
  }
  return cached
}

/**
 * A Db that connects on first use. Lets request contexts be built even when the
 * database is misconfigured, so the health check can still answer and say why.
 */
export const lazyDb: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = db()
    const value = Reflect.get(real, prop, real) as unknown
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export { schema }
