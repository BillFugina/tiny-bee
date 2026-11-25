import { describe, expect, it } from 'vitest'
import { migrationPlan } from '../scripts/migrate-plan.js'

const url = 'postgres://u:p@localhost:5432/db'

describe('migrationPlan', () => {
  it('runs whenever a database is configured', () => {
    expect(migrationPlan({ DATABASE_URL: url, VERCEL_ENV: 'preview' }, [])).toEqual({ action: 'run', url })
  })

  it('fails a Vercel preview or production build that has no database, even with --if-configured', () => {
    for (const VERCEL_ENV of ['preview', 'production']) {
      const plan = migrationPlan({ VERCEL_ENV }, ['--if-configured'])
      expect(plan.action).toBe('fail')
      expect(plan).toHaveProperty('message', expect.stringContaining(VERCEL_ENV))
    }
  })

  it('skips with --if-configured outside Vercel previews and production', () => {
    expect(migrationPlan({}, ['--if-configured']).action).toBe('skip')
    expect(migrationPlan({ VERCEL_ENV: 'development' }, ['--if-configured']).action).toBe('skip')
  })

  it('fails without --if-configured when there is no database', () => {
    expect(migrationPlan({}, []).action).toBe('fail')
  })
})
