// How the meetup page's live stream reacts when Ably's event stream fails.
// Shared so the browser hook and the tests use the same rules. Keep this file
// free of server-only and browser-only imports.

/** Retries after a failure before the page stops listening until it's shown again. */
export const MAX_STREAM_FAILURES = 6
/** A stream has to stay up this long before a failure counts as a fresh start. */
export const STREAM_STABLE_MS = 30_000
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000

/**
 * What to do after a stream error:
 * - `renew`: the token ran out, so reconnect with a fresh one.
 * - `stop`: Ably refused us for good (bad key, no permission, client not identified).
 *   Retrying would only repeat the refusal, so stop until the page is reloaded.
 * - `retry`: anything else, such as a dropped connection. Back off and retry.
 */
export type StreamErrorAction = 'renew' | 'stop' | 'retry'

/** Reads an Ably error event's data (JSON with a numeric `code`), if there is one. */
export function streamErrorAction(data: unknown): StreamErrorAction {
  const code = ablyErrorCode(data)
  if (code === undefined) return 'retry'
  if (code >= 40140 && code < 40150) return 'renew' // token expired or revoked
  // Refusals that won't change on retry: bad or wrong credentials, a missing
  // capability, an unidentified client, or forbidden. Other 401xx codes, such
  // as connection or account limits, can clear up, so they back off instead.
  if ((code >= 40100 && code < 40110) || (code >= 40160 && code < 40170) || code === 40300) return 'stop'
  return 'retry'
}

/** Wait before retry number `failures` (1 for the first): 2s, 4s, 8s … up to a minute, with jitter. */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1))
  return Math.round(base * (0.75 + random() * 0.5))
}

function ablyErrorCode(data: unknown): number | undefined {
  if (typeof data !== 'string' || data === '') return undefined
  try {
    const parsed = JSON.parse(data) as { code?: unknown; error?: { code?: unknown } }
    const code = parsed.code ?? parsed.error?.code
    return typeof code === 'number' ? code : undefined
  } catch {
    return undefined
  }
}
