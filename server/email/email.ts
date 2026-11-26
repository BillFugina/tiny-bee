/**
 * Email: sign-in links and meetup invites.
 *
 * An adapter, like live updates, so the app never depends on one provider.
 * Resend is called over its REST API with plain fetch (no SDK). With no key
 * set, emails are written to the server log instead, so local dev and
 * previews without a key still work (sign-in links can be copied from the log).
 */
export interface Email {
  to: string
  subject: string
  text: string
  html: string
  /**
   * Makes retries safe: the provider sends at most one email per key (Resend
   * remembers keys for 24 hours).
   */
  idempotencyKey?: string
}

export interface EmailSender {
  /** True when emails really go out; false when they're only logged. */
  readonly delivers: boolean
  /** Sends the email or throws. */
  send(email: Email): Promise<void>
}

/** Used when no key is set: the email goes to the server log, nowhere else. */
export const logOnlyEmail: EmailSender = {
  delivers: false,
  async send(email) {
    console.info(`[email] not sent (no RESEND_API_KEY) to ${email.to}: ${email.subject}\n${email.text}`)
  },
}

const RESEND_URL = 'https://api.resend.com/emails'
const ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 8000
const BACKOFF_MS = [500, 1500]
/** The longest Retry-After we'll honor before giving up on this request. */
const MAX_RETRY_AFTER_MS = 5000

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'EmailError'
  }
}

export interface ResendOptions {
  fetchImpl?: typeof fetch
  /** Swappable so tests don't wait out the backoff. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Resend. Retries rate limits (429), server errors (5xx) and network failures
 * a couple of times with backoff, sending the same Idempotency-Key each time
 * so a retry can never send a second copy. Other refusals (a bad key, an
 * unverified domain, a bad address) fail at once.
 */
export function resendEmail(apiKey: string, from: string, options: ResendOptions = {}): EmailSender {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  return {
    delivers: true,
    async send(email) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
      if (email.idempotencyKey) headers['Idempotency-Key'] = email.idempotencyKey
      const body = JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      })

      let lastError: EmailError | undefined
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        let retryAfterMs: number | undefined
        try {
          const response = await fetchImpl(RESEND_URL, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          })
          if (response.ok) return
          const detail = await safeText(response)
          lastError = new EmailError(`Resend refused the email: HTTP ${response.status} ${detail}`, response.status)
          if (response.status !== 429 && response.status < 500) throw lastError
          retryAfterMs = retryAfter(response)
        } catch (error) {
          if (error === lastError) throw error
          lastError = new EmailError(
            `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        if (attempt < ATTEMPTS - 1) {
          const wait = retryAfterMs ?? BACKOFF_MS[attempt] ?? 1500
          if (wait > MAX_RETRY_AFTER_MS) break
          await sleep(wait)
        }
      }
      throw lastError ?? new EmailError('Could not send the email')
    },
  }
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/** For putting people's names and meetup titles into an HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
