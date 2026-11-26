import { escapeHtml, type Email } from './email.js'

/** Names and titles are typed by members; keep them short in a subject line. */
function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function layout(paragraphs: string[], button: { label: string; url: string }, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('')
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fffbea;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2933;line-height:1.5">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:600">tiny-bee</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#f5b301;color:#1f2933;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>
<p style="margin:0;font-size:13px;color:#52606d">${footer}</p>
</div></body></html>`
}

export function signInEmail(to: string, url: string, minutes: number): Email {
  return {
    to,
    subject: 'Your tiny-bee sign-in link',
    text: [
      'Use this link to sign in to tiny-bee:',
      url,
      '',
      `It works once, for the next ${minutes} minutes.`,
      "If you didn't ask for it, you can ignore this email.",
    ].join('\n'),
    html: layout(
      ['Tap the button to sign in to tiny-bee.'],
      { label: 'Sign in', url },
      `It works once, for the next ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
    ),
  }
}

export function inviteEmail(options: {
  to: string
  inviter: string
  title: string
  url: string
  idempotencyKey: string
}): Email {
  const inviter = clip(options.inviter, 60)
  const title = clip(options.title, 80)
  return {
    to: options.to,
    subject: `${inviter} invited you to "${title}" on tiny-bee`,
    text: [
      `${inviter} invited you to help pick a place for "${title}".`,
      "tiny-bee finds somewhere that's a fair drive for everyone. Open the meetup to join:",
      options.url,
      '',
      `You got this because ${inviter} entered your email address on tiny-bee. If you don't know them, you can ignore it.`,
    ].join('\n'),
    html: layout(
      [
        `${escapeHtml(inviter)} invited you to help pick a place for <strong>${escapeHtml(title)}</strong>.`,
        "tiny-bee finds somewhere that's a fair drive for everyone.",
      ],
      { label: 'Open the meetup', url: options.url },
      `You got this because ${escapeHtml(inviter)} entered your email address on tiny-bee. If you don't know them, you can ignore it.`,
    ),
    idempotencyKey: options.idempotencyKey,
  }
}
