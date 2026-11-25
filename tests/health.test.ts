import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkHealth } from '../server/health.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkHealth', () => {
  it('names what is missing instead of throwing', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('DATABASE_URL', '')
    expect(await checkHealth()).toEqual({ ok: false, checks: { authSecret: false, database: 'missing' } })
  })

  it('rejects a secret shorter than 32 characters', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'too-short')
    vi.stubEnv('DATABASE_URL', '')
    expect((await checkHealth()).checks.authSecret).toBe(false)
  })
})
