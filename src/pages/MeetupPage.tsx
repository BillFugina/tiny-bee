import { useForm } from '@tanstack/react-form'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { DRIVE_LIMIT, startFields } from '../../shared/schemas'
import { authClient } from '../lib/auth-client'
import { useTRPC } from '../lib/trpc'

export function MeetupPage() {
  const { meetupId = '' } = useParams()
  const location = useLocation()
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <p className="muted">Loading…</p>
  if (!session) {
    return (
      <section className="card">
        <h1>You're invited to a meetup</h1>
        <p>
          <Link to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}>Sign in or create an account</Link> to
          join it.
        </p>
      </section>
    )
  }
  return <SignedInMeetup meetupId={meetupId} />
}

function SignedInMeetup({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const preview = useQuery(trpc.meetups.preview.queryOptions({ meetupId }, { retry: false }))
  const join = useMutation(
    trpc.meetups.join.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.meetups.pathKey() }),
    }),
  )

  if (preview.isPending) return <p className="muted">Loading…</p>
  if (!preview.data) {
    return (
      <section>
        <h1>Meetup not found</h1>
        <p className="muted">Check the link, or ask whoever shared it for a new one.</p>
        <Link to="/">Back to your meetups</Link>
      </section>
    )
  }
  if (!preview.data.isMember) {
    const { title, organizer, memberCount } = preview.data
    return (
      <section className="card">
        <h1>{title}</h1>
        <p>
          {organizer} invited you. {memberCount === 1 ? '1 person has' : `${memberCount} people have`} joined so far.
        </p>
        <button type="button" disabled={join.isPending} onClick={() => join.mutate({ meetupId })}>
          {join.isPending ? 'Joining…' : 'Join this meetup'}
        </button>
        {join.error ? <span className="error">{join.error.message}</span> : null}
      </section>
    )
  }
  return <MemberView meetupId={meetupId} />
}

function MemberView({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const meetup = useQuery(trpc.meetups.get.queryOptions({ meetupId }))

  if (meetup.isPending) return <p className="muted">Loading…</p>
  if (!meetup.data) return <p className="error">{meetup.error?.message ?? 'Could not load this meetup.'}</p>

  const me = meetup.data.members.find((m) => m.isMe)
  return (
    <section className="stack">
      <h1>{meetup.data.title}</h1>
      <ShareLink />

      <div className="card">
        <h2>Who's coming</h2>
        <ul className="plain">
          {meetup.data.members.map((m) => (
            <li key={m.userId}>
              <strong>{m.isMe ? `${m.name} (you)` : m.name}</strong>
              {m.role === 'organizer' ? <span className="muted"> · organizer</span> : null}
              <br />
              <span className="muted">
                {m.start && m.maxMinutes
                  ? `From ${m.start.label}, up to ${formatMinutes(m.maxMinutes)}`
                  : 'No starting point yet'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {me ? (
        <StartForm
          key={`${me.start?.townId ?? 0}-${me.maxMinutes ?? 0}`}
          meetupId={meetupId}
          start={me.start}
          maxMinutes={me.maxMinutes}
        />
      ) : null}
      <FairAreas meetupId={meetupId} />
    </section>
  )
}

function ShareLink() {
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

function StartForm(props: {
  meetupId: string
  start: { townId: number; label: string } | null
  maxMinutes: number | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [townText, setTownText] = useState(props.start?.label ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const query = useDebounced(townText.trim(), 250)
  const suggestions = useQuery(
    trpc.places.search.queryOptions({ q: query }, { enabled: showSuggestions && query.length >= 2 }),
  )
  const save = useMutation(
    trpc.meetups.setMyStart.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.meetups.pathKey() }),
    }),
  )

  const form = useForm({
    defaultValues: { townId: props.start?.townId ?? 0, maxMinutes: props.maxMinutes ?? 60 },
    validators: { onSubmit: startFields },
    onSubmit: async ({ value }) => {
      await save.mutateAsync({ meetupId: props.meetupId, ...value })
    },
  })

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h2>Your starting point</h2>
      <form.Field name="townId">
        {(field) => (
          <label className="autocomplete">
            Town you're leaving from
            <input
              value={townText}
              autoComplete="off"
              placeholder="Start typing a town"
              onChange={(e) => {
                setTownText(e.target.value)
                setShowSuggestions(true)
                field.handleChange(0)
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && suggestions.data?.length ? (
              <ul className="suggestions" role="listbox">
                {suggestions.data.map((town) => (
                  <li key={town.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        field.handleChange(town.id)
                        setTownText(town.label)
                        setShowSuggestions(false)
                      }}
                    >
                      {town.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {showSuggestions && query.length >= 2 && suggestions.data?.length === 0 ? (
              <span className="muted">No towns match. Try the nearest larger town.</span>
            ) : null}
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Field name="maxMinutes">
        {(field) => (
          <label>
            Longest drive you'd make (minutes)
            <input
              type="number"
              inputMode="numeric"
              min={DRIVE_LIMIT.min}
              max={DRIVE_LIMIT.max}
              step={5}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.valueAsNumber)}
            />
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : props.start ? 'Update' : 'Save'}
          </button>
        )}
      </form.Subscribe>
      {save.error ? <span className="error">{save.error.message}</span> : null}
    </form>
  )
}

const WEIGHTS = [
  { value: 0, label: 'Shortest longest drive' },
  { value: 0.25, label: '' },
  { value: 0.5, label: 'Balanced' },
  { value: 0.75, label: '' },
  { value: 1, label: 'Least driving overall' },
]

function FairAreas({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const [step, setStep] = useState(0)
  const averageWeight = WEIGHTS[step]!.value
  const fair = useQuery(
    trpc.meetups.fairAreas.queryOptions({ meetupId, averageWeight }, { placeholderData: keepPreviousData }),
  )

  return (
    <div className="card">
      <h2>Fairest places to meet</h2>
      {fair.isPending ? (
        <p className="muted">Working it out…</p>
      ) : !fair.data ? (
        <p className="error">{fair.error?.message ?? 'Could not load the fair areas.'}</p>
      ) : fair.data.ready < 2 ? (
        <p className="muted">
          This needs at least two starting points.
          {fair.data.waitingOn.length ? ` Still waiting on: ${fair.data.waitingOn.join(', ')}.` : ''}
        </p>
      ) : (
        <>
          <label>
            Favor
            <input
              type="range"
              min={0}
              max={WEIGHTS.length - 1}
              step={1}
              value={step}
              onChange={(e) => setStep(e.target.valueAsNumber)}
            />
            <span className="scale muted">
              <span>{WEIGHTS[0]!.label}</span>
              <span>{WEIGHTS[WEIGHTS.length - 1]!.label}</span>
            </span>
          </label>
          {fair.data.areas.length ? (
            <ol className="areas">
              {fair.data.areas.map((area) => (
                <AreaItem key={area.id} area={area} />
              ))}
            </ol>
          ) : (
            <>
              <p>Nowhere fits everyone's drive limit. These come closest:</p>
              <ol className="areas">
                {fair.data.closestMisses.map((area) => (
                  <AreaItem key={area.id} area={area} />
                ))}
              </ol>
            </>
          )}
          {fair.data.waitingOn.length ? (
            <p className="muted">Not counted yet: {fair.data.waitingOn.join(', ')}.</p>
          ) : null}
          <p className="muted small">
            Drive times are rough estimates from distance. Real road times come once a maps service is added.
          </p>
        </>
      )}
    </div>
  )
}

type Area = {
  id: string
  name: string
  isMidpoint: boolean
  longest: number
  average: number
  times: { name: string; isMe: boolean; minutes: number; maxMinutes: number }[]
}

function AreaItem({ area }: { area: Area }) {
  return (
    <li>
      <strong>{area.isMidpoint ? 'The halfway point (no town nearby)' : area.name}</strong>
      <span className="muted">
        {' '}
        · longest {formatMinutes(area.longest)}, average {formatMinutes(area.average)}
      </span>
      <ul className="times">
        {area.times.map((t) => (
          <li key={t.name} className={t.minutes > t.maxMinutes ? 'error' : undefined}>
            {t.isMe ? 'You' : t.name}: {formatMinutes(t.minutes)}
            {t.minutes > t.maxMinutes ? ` (over ${formatMinutes(t.maxMinutes)})` : ''}
          </li>
        ))}
      </ul>
    </li>
  )
}

function FieldErrors({ errors }: { errors: unknown[] }) {
  return errors.map((err, i) => (
    <span key={i} className="error">
      {typeof err === 'string' ? err : (err as { message?: string } | undefined)?.message}
    </span>
  ))
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
