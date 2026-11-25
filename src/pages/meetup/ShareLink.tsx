import { useState } from 'react'

export function ShareLink() {
  const [copied, setCopied] = useState(false)
  const url = window.location.href
  return (
    <div className="share">
      <input readOnly value={url} aria-label="Link to share" onFocus={(e) => e.target.select()} />
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
    </div>
  )
}
