import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { agentRedirect, authClient, isAgentSignIn } from '../lib/auth-client'

/** What each scope an agent can ask for lets it do, in the member's words. */
const SCOPE_TEXT: Record<string, string> = {
  meetups:
    'Act as you in your meetups: read them, set your start and private notes, add places to shortlists, and cast ballots you approve',
  offline_access: 'Stay connected until you sign out of it, without asking you again',
  profile: 'See your name',
  email: 'See your email address',
}

/**
 * Where an agent's connection request lands after sign-in. The member sees
 * which app is asking and what it could do, then allows or denies it. Nothing
 * is granted until they press Allow.
 */
export function ConsentPage() {
  const [params] = useSearchParams()
  const clientId = params.get('client_id') ?? ''
  const scopes = (params.get('scope') ?? '').split(' ').filter((s) => SCOPE_TEXT[s])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const client = useQuery({
    queryKey: ['oauth-client', clientId],
    enabled: isAgentSignIn(params),
    queryFn: async () => {
      const { data, error } = await authClient.$fetch<{ client_name?: string; client_uri?: string }>(
        '/oauth2/public-client',
        { method: 'GET', query: { client_id: clientId } },
      )
      if (error) throw new Error(error.message || `HTTP ${error.status}`)
      return data
    },
  })

  if (!isAgentSignIn(params)) {
    return (
      <section>
        <h1>Nothing to approve</h1>
        <p className="muted">
          This page is where you approve an agent connecting to tiny-bee. <Link to="/">Back to your meetups</Link>
        </p>
      </section>
    )
  }

  async function answer(accept: boolean) {
    setError(null)
    setBusy(true)
    const { data, error } = await authClient.$fetch('/oauth2/consent', { method: 'POST', body: { accept } })
    if (error) {
      setBusy(false)
      setError(error.message || `Something went wrong (HTTP ${error.status})`)
      return
    }
    // The auth client follows the redirect itself; this covers it if it didn't.
    const url = agentRedirect(data)
    if (url) window.location.assign(url)
  }

  // The name comes from the app that registered itself, so it's shown as its claim, not vouched for.
  const name = client.data?.client_name?.trim() || 'An app'

  return (
    <section>
      <h1>Connect an agent to tiny-bee?</h1>
      <div className="card">
        {client.isPending ? (
          <p className="muted">Looking up the app…</p>
        ) : client.isError ? (
          <p className="error">Couldn't look up the app asking to connect. You can still deny it.</p>
        ) : (
          <p>
            <strong>{name}</strong> (it names itself) wants to:
          </p>
        )}
        <ul>
          {scopes.map((s) => (
            <li key={s}>{SCOPE_TEXT[s]}</li>
          ))}
        </ul>
        <p className="muted small">
          It acts as you, only in meetups you're in. Allow it only if you started this connection yourself.
        </p>
        <button type="button" disabled={busy || client.isError} onClick={() => void answer(true)}>
          Allow
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => void answer(false)}>
          Deny
        </button>
        {error ? <span className="error">{error}</span> : null}
      </div>
    </section>
  )
}
