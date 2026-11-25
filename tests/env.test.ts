import { describe, expect, it } from 'vitest'
import { isNeonUrl } from '../server/db/client.js'
import { appOrigin, trustedOrigins, type Env } from '../server/env.js'

const base: Env = { DATABASE_URL: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32) }

describe('appOrigin', () => {
  it('prefers an explicit BETTER_AUTH_URL', () => {
    expect(appOrigin({ ...base, BETTER_AUTH_URL: 'https://tinybee.example', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://tinybee.example',
    )
  })

  it('uses the production domain in production', () => {
    expect(
      appOrigin({
        ...base,
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'tiny-bee.vercel.app',
        VERCEL_URL: 'tiny-bee-abc123.vercel.app',
      }),
    ).toBe('https://tiny-bee.vercel.app')
  })

  it('uses the stable branch URL on previews', () => {
    expect(
      appOrigin({
        ...base,
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'tiny-bee-git-feature-bill.vercel.app',
        VERCEL_URL: 'tiny-bee-abc123.vercel.app',
      }),
    ).toBe('https://tiny-bee-git-feature-bill.vercel.app')
  })

  it('falls back to the Vite dev server locally', () => {
    expect(appOrigin(base)).toBe('http://localhost:5173')
  })
})

describe('trustedOrigins', () => {
  it("trusts a preview's branch URL, its own deployment URL and the production domain", () => {
    expect(
      trustedOrigins({
        ...base,
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'tiny-bee-git-feature-bill.vercel.app',
        VERCEL_URL: 'tiny-bee-abc123.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'tiny-bee.vercel.app',
      }),
    ).toEqual([
      'https://tiny-bee-git-feature-bill.vercel.app',
      'https://tiny-bee-abc123.vercel.app',
      'https://tiny-bee.vercel.app',
    ])
  })

  it('still trusts the URL a preview is opened on when BETTER_AUTH_URL points elsewhere', () => {
    const origins = trustedOrigins({
      ...base,
      BETTER_AUTH_URL: 'https://tiny-bee-git-old-branch-bill.vercel.app/',
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'tiny-bee-git-feature-bill.vercel.app',
    })
    expect(origins).toContain('https://tiny-bee-git-old-branch-bill.vercel.app')
    expect(origins).toContain('https://tiny-bee-git-feature-bill.vercel.app')
  })

  it('is just localhost in local dev', () => {
    expect(trustedOrigins(base)).toEqual(['http://localhost:5173'])
  })
})

describe('isNeonUrl', () => {
  it('detects Neon hosts', () => {
    expect(isNeonUrl('postgresql://u:p@ep-cool-1234.us-east-2.aws.neon.tech/neondb?sslmode=require')).toBe(true)
  })
  it('treats anything else as plain Postgres', () => {
    expect(isNeonUrl('postgres://postgres@localhost:5432/tinybee')).toBe(false)
    expect(isNeonUrl('not a url')).toBe(false)
  })
})
