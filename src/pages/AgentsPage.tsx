import { useState } from 'react'
import { Link } from 'react-router'

/** How to connect your own AI agent (Claude, Codex or any MCP client) to tiny-bee. */
export function AgentsPage({ origin = window.location.origin }: { origin?: string }) {
  const serverUrl = `${origin}/api/mcp`

  return (
    <section className="stack page-narrow">
      <p className="eyebrow">
        <span className="eyebrow__line" aria-hidden="true" />
        For the technically curious
      </p>
      <h1 className="display">Plan with your own AI agent</h1>
      <p>
        tiny-bee has an MCP server, so the agent you already use (Claude, Codex or any app that speaks MCP) can join
        your meetups and plan with you. Once you sign in and approve it, it acts as you, and only in meetups you're in.
      </p>

      <div className="card">
        <h2>The server address</h2>
        <CopyField id="mcp-url" label="MCP server address" value={serverUrl} />
        <p className="muted small">
          Paste this into your agent as a remote MCP server. It needs no key: your agent sends you here to sign in.
        </p>
      </div>

      <div className="card">
        <h2>Claude (claude.ai and the desktop app)</h2>
        <ol className="steps">
          <li>
            Open <strong>Customize</strong> &gt; <strong>Connectors</strong>, then <strong>+ Add</strong> &gt;{' '}
            <strong>Add custom connector</strong>.
          </li>
          <li>
            Name it <strong>tiny-bee</strong>, paste the address above and choose <strong>Continue</strong>.
          </li>
          <li>Pick when to sign in, choose Add, then sign in to tiny-bee and allow it.</li>
        </ol>
        <p className="muted small">
          The Free plan allows one custom connector. On Team and Enterprise plans, an owner adds it first under
          Organization settings.
        </p>
      </div>

      <div className="card">
        <h2>Claude Code</h2>
        <CopyField
          id="claude-code"
          label="Claude Code command"
          value={`claude mcp add --transport http tiny-bee ${serverUrl}`}
        />
        <p>
          Then run <code>/mcp</code> in Claude Code, pick tiny-bee and sign in when your browser opens.
        </p>
      </div>

      <div className="card">
        <h2>Codex</h2>
        <p>
          Add this to <code>~/.codex/config.toml</code>:
        </p>
        <pre>
          <code>{`[mcp_servers.tiny-bee]\nurl = "${serverUrl}"`}</code>
        </pre>
        <CopyField id="codex-login" label="Codex sign-in command" value="codex mcp login tiny-bee" />
      </div>

      <div className="card">
        <h2>Other agents</h2>
        <p>
          Any MCP client that supports remote (Streamable HTTP) servers with OAuth sign-in works. It registers itself,
          so there's no client ID to set up.
        </p>
      </div>

      <div className="card">
        <h2>What your agent can do</h2>
        <ul className="steps">
          <li>List your meetups, start a new one and join one from an invite link.</li>
          <li>Set where you're starting from, your longest drive and private notes only you see.</li>
          <li>Show the fairest areas and the shortlist, and add places when you ask.</li>
          <li>Check how voting stands, and cast your ballot once you've approved the exact ranking.</li>
        </ul>
        <p className="muted small">
          It can't see other members' drive limits or notes, and it can't act in meetups you're not in. You can remove
          it from your agent's connector settings at any time.
        </p>
      </div>

      <p>
        <Link to="/">Back to your meetups</Link>
      </p>
    </section>
  )
}

/** A read-only value with a Copy button. */
function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="share">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="mono" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
