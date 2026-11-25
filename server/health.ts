import { sql } from 'drizzle-orm'
import { db } from './db/client.js'

export type DatabaseCheck = 'ok' | 'missing' | 'unreachable' | 'not-migrated'

export interface Health {
  ok: boolean
  checks: { authSecret: boolean; database: DatabaseCheck }
}

function errorCode(error: unknown): string | undefined {
  for (let e: unknown = error, depth = 0; e && depth < 4; depth++) {
    if (typeof e === 'object' && 'code' in e && typeof e.code === 'string') return e.code
    e = typeof e === 'object' && 'cause' in e ? e.cause : undefined
  }
  return undefined
}

/**
 * Says whether this deployment is configured, without revealing any values:
 * only whether the auth secret is set and whether the database answers with
 * the schema in place. Shown on the home page so a broken preview explains itself.
 */
export async function checkHealth(): Promise<Health> {
  const authSecret = (process.env.BETTER_AUTH_SECRET ?? '').length >= 32
  let database: DatabaseCheck = 'ok'
  if (!process.env.DATABASE_URL) {
    database = 'missing'
  } else {
    try {
      await db().execute(sql`select 1 from "user" limit 1`)
    } catch (error) {
      // 42P01: undefined_table, i.e. migrations haven't run on this database.
      database = errorCode(error) === '42P01' ? 'not-migrated' : 'unreachable'
      console.error('[health] database check failed:', error)
    }
  }
  return { ok: authSecret && database === 'ok', checks: { authSecret, database } }
}
