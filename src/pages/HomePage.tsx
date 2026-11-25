import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { createMeetupInput } from '../../shared/schemas'
import { authClient } from '../lib/auth-client'
import { useTRPC } from '../lib/trpc'

export function HomePage() {
  const trpc = useTRPC()
  const health = useQuery(trpc.health.queryOptions())
  const { data: session, isPending } = authClient.useSession()

  return (
    <section>
      <h1>Plan a meetup everyone can actually make</h1>
      <p className="muted">API: {describeHealth(health)}</p>
      {isPending ? null : session ? (
        <MyMeetups />
      ) : (
        <p>
          <Link to="/sign-in">Sign in</Link> to start a meetup.
        </p>
      )}
    </section>
  )
}

function describeHealth(health: {
  isPending: boolean
  error: { message: string } | null
  data?: { ok: boolean; checks: { authSecret: boolean; database: string } }
}): string {
  if (health.isPending) return 'checking…'
  if (!health.data) return `down (${health.error?.message ?? 'no response'})`
  if (health.data.ok) return 'up'
  const problems: string[] = []
  if (!health.data.checks.authSecret) problems.push('BETTER_AUTH_SECRET missing or too short')
  if (health.data.checks.database !== 'ok') problems.push(`database ${health.data.checks.database}`)
  return `up, but ${problems.join('; ')}`
}

function MyMeetups() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const meetups = useQuery(trpc.meetups.listMine.queryOptions())
  const create = useMutation(
    trpc.meetups.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.meetups.listMine.queryKey() }),
    }),
  )

  const form = useForm({
    defaultValues: { title: '' },
    validators: { onSubmit: createMeetupInput },
    onSubmit: async ({ value, formApi }) => {
      await create.mutateAsync(value)
      formApi.reset()
    },
  })

  return (
    <>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="title">
          {(field) => (
            <label>
              New meetup
              <input
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Saturday brunch"
              />
              {field.state.meta.errors.map((err, i) => (
                <span key={i} className="error">
                  {typeof err === 'string' ? err : err?.message}
                </span>
              ))}
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create'}
            </button>
          )}
        </form.Subscribe>
        {create.error ? <span className="error">{create.error.message}</span> : null}
      </form>

      <h2>Your meetups</h2>
      {meetups.isPending ? (
        <p className="muted">Loading…</p>
      ) : meetups.data?.length ? (
        <ul>
          {meetups.data.map((m) => (
            <li key={m.id}>
              {m.title} <span className="muted">({m.role})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None yet.</p>
      )}
    </>
  )
}
