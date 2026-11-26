import { useState } from 'react'

/** The meetup's invite link, with Copy and, where the device offers it, Share. */
export function ShareLink({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.href
  const canShare = typeof navigator.share === 'function'
  return (
    <div className="share">
      <label className="sr-only" htmlFor="invite-link">
        Invite link
      </label>
      <input id="invite-link" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {canShare ? (
        <button
          type="button"
          onClick={() => {
            navigator
              .share({
                title,
                text: `Help me pick a place for "${title}" on tiny-bee. It finds somewhere that's a fair drive for everyone.`,
                url,
              })
              .catch(() => {}) // Closing the share sheet rejects; nothing to do.
          }}
        >
          Share
        </button>
      ) : null}
    </div>
  )
}
