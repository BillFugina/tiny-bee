import { describe, expect, it } from 'vitest'
import { backoffMs, streamErrorAction } from '../shared/liveStream.js'

describe('live stream errors', () => {
  it('stops for good when Ably refuses the client', () => {
    // 40161: the channel needs an identified client. Retrying only repeats it.
    expect(streamErrorAction(JSON.stringify({ code: 40161, statusCode: 401, message: 'identified client' }))).toBe(
      'stop',
    )
    expect(streamErrorAction(JSON.stringify({ code: 40160 }))).toBe('stop')
    expect(streamErrorAction(JSON.stringify({ code: 40101 }))).toBe('stop')
    expect(streamErrorAction(JSON.stringify({ error: { code: 40300 } }))).toBe('stop')
  })

  it('renews when the token ran out', () => {
    expect(streamErrorAction(JSON.stringify({ code: 40142 }))).toBe('renew')
    expect(streamErrorAction(JSON.stringify({ code: 40140 }))).toBe('renew')
  })

  it('retries anything else, a dropped connection included', () => {
    expect(streamErrorAction(undefined)).toBe('retry')
    expect(streamErrorAction('')).toBe('retry')
    expect(streamErrorAction('not json')).toBe('retry')
    expect(streamErrorAction(JSON.stringify({ code: 50000 }))).toBe('retry')
    expect(streamErrorAction(JSON.stringify({ code: 80003 }))).toBe('retry')
    // Connection or account limits can clear up.
    expect(streamErrorAction(JSON.stringify({ code: 40111 }))).toBe('retry')
    expect(streamErrorAction(JSON.stringify({ code: 40150 }))).toBe('retry')
  })
})

describe('live stream backoff', () => {
  it('doubles from 2s and tops out at a minute', () => {
    const middle = () => 0.5 // no jitter
    expect([1, 2, 3, 4, 5, 6, 7, 10].map((n) => backoffMs(n, middle))).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ])
  })

  it('adds up to 25% jitter either way', () => {
    expect(backoffMs(1, () => 0)).toBe(1_500)
    expect(backoffMs(1, () => 0.999999)).toBe(2_500)
  })
})
