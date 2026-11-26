/**
 * Live updates: when a meetup changes, everyone with it open refreshes.
 *
 * An adapter, so the app never depends on Ably directly (the scope doc calls
 * for one around Ably). Messages carry no meetup data, only "something
 * changed": each browser then refetches through tRPC, which checks
 * membership as usual. So a channel can never leak anything but timing.
 */
export interface LiveUpdates {
  /** Tell everyone watching this meetup to refresh. Never throws. */
  publishChange(meetupId: string): Promise<void>
  /** A short-lived token that can only listen to this one meetup's channel. */
  subscribeToken(meetupId: string): Promise<LiveToken | null>
}

export interface LiveToken {
  /** Where the browser opens its event stream. */
  host: string
  channel: string
  token: string
  /** When the token stops working, in ms since the epoch. */
  expires: number
}

/** One channel per meetup. The Ably key is limited to `meetup:*`. */
export function meetupChannel(meetupId: string): string {
  return `meetup:${meetupId}`
}

/** Used when no key is set: the app works, pages just don't refresh by themselves. */
export const noLiveUpdates: LiveUpdates = {
  publishChange: async () => {},
  subscribeToken: async () => null,
}

const ABLY_HOST = 'main.realtime.ably.net'
const TOKEN_TTL_MS = 60 * 60 * 1000
const PUBLISH_TIMEOUT_MS = 3000

/**
 * Ably over its REST API with plain fetch (no SDK). The key stays on the
 * server; browsers only ever get subscribe-only tokens for one channel.
 */
export function ablyLiveUpdates(apiKey: string, fetchImpl: typeof fetch = fetch): LiveUpdates {
  const colon = apiKey.indexOf(':')
  if (colon <= 0) throw new Error('ABLY_API_KEY should look like appId.keyId:secret')
  const keyName = apiKey.slice(0, colon)
  const authorization = `Basic ${Buffer.from(apiKey).toString('base64')}`
  const headers = { Authorization: authorization, 'Content-Type': 'application/json' }

  return {
    async publishChange(meetupId) {
      const channel = encodeURIComponent(meetupChannel(meetupId))
      try {
        const response = await fetchImpl(`https://${ABLY_HOST}/channels/${channel}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'changed' }),
          signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
        })
        if (!response.ok) console.error(`[live] publish failed: HTTP ${response.status} ${await safeText(response)}`)
      } catch (error) {
        // A missed refresh isn't worth failing the change the member just made.
        console.error('[live] publish failed:', error)
      }
    },

    async subscribeToken(meetupId) {
      const channel = meetupChannel(meetupId)
      const response = await fetchImpl(`https://${ABLY_HOST}/keys/${encodeURIComponent(keyName)}/requestToken`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyName,
          timestamp: Date.now(),
          ttl: TOKEN_TTL_MS,
          capability: JSON.stringify({ [channel]: ['subscribe'] }),
        }),
        signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
      })
      if (!response.ok) {
        console.error(`[live] token request failed: HTTP ${response.status} ${await safeText(response)}`)
        return null
      }
      const details = (await response.json()) as { token?: unknown; expires?: unknown }
      if (typeof details.token !== 'string' || typeof details.expires !== 'number') {
        console.error('[live] token request returned an unexpected shape')
        return null
      }
      return { host: ABLY_HOST, channel, token: details.token, expires: details.expires }
    },
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Lets a publish finish after the response goes out, so a slow or unreachable
 * Ably never holds up the change a member just made. On Vercel this hands the
 * promise to the function's waitUntil (the same request context that
 * @vercel/functions reads), which keeps the function alive until it settles.
 * Elsewhere (local dev, tests) it simply waits, bounded by the publish timeout.
 */
export function afterResponse(task: Promise<void>): Promise<void> {
  const holder = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
    { get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined } | undefined
  const waitUntil = holder?.get?.()?.waitUntil
  if (!waitUntil) return task
  waitUntil(task)
  return Promise.resolve()
}
