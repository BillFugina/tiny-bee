import { env } from '../env.js'
import { logOnlyEmail, resendEmail, type EmailSender } from './email.js'

export const DEFAULT_EMAIL_FROM = 'tiny-bee <noreply@notify.billfugina.com>'

let built: { key: string | undefined; from: string; sender: EmailSender } | undefined

/** Resend when RESEND_API_KEY is set, built once per function instance; otherwise the log. */
export function configuredEmail(): EmailSender {
  let key: string | undefined
  let from: string
  try {
    const e = env()
    key = e.RESEND_API_KEY
    from = e.EMAIL_FROM ?? DEFAULT_EMAIL_FROM
  } catch {
    return logOnlyEmail // Misconfigured env shows up elsewhere.
  }
  if (built && built.key === key && built.from === from) return built.sender
  const sender = key ? resendEmail(key, from) : logOnlyEmail
  built = { key, from, sender }
  return sender
}
