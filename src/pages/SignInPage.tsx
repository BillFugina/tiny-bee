import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { agentRedirect, authClient, isAgentSignIn } from '../lib/auth-client'
import { useTRPC } from '../lib/trpc'

const credentials = z.object({
  name: z.string(),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})

type Mode = 'sign-in' | 'sign-up'

export function SignInPage() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  // An agent sent the member here to connect; after sign-in, Better Auth says where to go next.
  const forAgent = isAgentSignIn(params)
  const queryClient = useQueryClient()
  const trpc = useTRPC()
  const emailDelivers = useQuery(trpc.email.queryOptions()).data?.delivers

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: credentials },
    onSubmit: async ({ value }) => {
      setError(null)
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({
              name: value.name || value.email,
              email: value.email,
              password: value.password,
            })
          : await authClient.signIn.email({ email: value.email, password: value.password })
      if (result.error) {
        setError(result.error.message || `Something went wrong (HTTP ${result.error.status})`)
        return
      }
      const agentNext = agentRedirect(result.data)
      if (agentNext) {
        window.location.assign(agentNext)
        return
      }
      await queryClient.invalidateQueries()
      await navigate(next)
    },
  })

  async function sendMagicLink() {
    setError(null)
    const email = form.getFieldValue('email')
    if (!z.email().safeParse(email).success) {
      setError('Enter your email first')
      return
    }
    const result = await authClient.signIn.magicLink({ email, callbackURL: next })
    if (result.error) setError(result.error.message || `Could not send the link (HTTP ${result.error.status})`)
    else if (emailDelivers === false)
      setNotice("This server doesn't send email, so the link went to the server log. It works for the next 10 minutes.")
    else setNotice('Link sent. Check your email; it works for the next 10 minutes.')
  }

  return (
    <section className="auth">
      <h1>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
      {forAgent ? <p className="muted">Sign in to connect your agent to tiny-bee. You'll approve it next.</p> : null}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {mode === 'sign-up' ? (
          <form.Field name="name">
            {(field) => (
              <label>
                Name
                <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
              </label>
            )}
          </form.Field>
        ) : null}
        {(['email', 'password'] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label>
                {name === 'email' ? 'Email' : 'Password'}
                <input
                  type={name}
                  autoComplete={name === 'email' ? 'email' : mode === 'sign-up' ? 'new-password' : 'current-password'}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((err, i) => (
                  <span key={i} className="error">
                    {typeof err === 'string' ? err : err?.message}
                  </span>
                ))}
              </label>
            )}
          </form.Field>
        ))}
        <button type="submit">{mode === 'sign-in' ? 'Sign in' : 'Sign up'}</button>
        {forAgent ? null : (
          // A magic link opens in a new page and would drop the agent's request.
          <button type="button" className="link" onClick={sendMagicLink}>
            Email me a sign-in link instead
          </button>
        )}
        {error ? <span className="error">{error}</span> : null}
        {notice ? <span className="muted">{notice}</span> : null}
      </form>
      <button type="button" className="link" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
        {mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </section>
  )
}

/** Only same-site paths, so a crafted link can't bounce people elsewhere after sign-in. */
function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/'
}
