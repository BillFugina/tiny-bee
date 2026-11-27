import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { createMeetupInput } from '../../shared/schemas'
import {
  ArrowRightIcon,
  BotIcon,
  CheckSquareIcon,
  MapPinIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
} from '../components/icons'
import { authClient } from '../lib/auth-client'
import { useTRPC } from '../lib/trpc'

export function HomePage() {
  const trpc = useTRPC()
  const health = useQuery(trpc.health.queryOptions())
  const { data: session, isPending } = authClient.useSession()
  const status = <ApiStatus text={describeHealth(health)} ok={health.data?.ok} />

  if (isPending) return <HomeHero status={status} />
  if (session) {
    return (
      <div className="home">
        <HomeHero compact status={status} />
        <MyMeetups />
        <AgentCallout />
      </div>
    )
  }
  return (
    <div className="home">
      <HomeHero status={status} action={<SignInPrompt />} figure />
      <HowItWorks />
      <AgentCallout />
    </div>
  )
}

/** The home page as a signed-out visitor sees it, with no data to load. Rendered to HTML at build time. */
export function SignedOutHome() {
  return (
    <div className="home">
      <HomeHero action={<SignInPrompt />} figure />
      <HowItWorks />
      <AgentCallout />
    </div>
  )
}

function HomeHero(props: { compact?: boolean; figure?: boolean; action?: ReactNode; status?: ReactNode }) {
  return (
    <section className={props.compact ? 'hero hero--compact' : 'hero'} aria-labelledby="home-title">
      <div className="hero__copy">
        <p className="eyebrow">
          <span className="eyebrow__line" aria-hidden="true" />A better way to get there
        </p>
        <h1 id="home-title" className="hero__title">
          Plan a meetup <span className="hero__soft">everyone can</span>{' '}
          <span className="hero__mark">actually make</span>
        </h1>
        <p className="lead">
          Tiny Bee helps a group find a place to meet that's fair to everyone. Each member privately tells the planner
          where they're starting from and how far they'll drive, then Tiny Bee suggests the fairest towns, builds a
          shortlist and runs a ranked-choice vote.
        </p>
        {props.action || props.status ? (
          <div className="hero__actions">
            {props.action}
            {props.status}
          </div>
        ) : null}
      </div>
      {props.figure ? <RouteFigure /> : null}
    </section>
  )
}

function SignInPrompt() {
  return (
    <Link to="/sign-in" className="button button--large">
      Sign in to start a meetup <ArrowRightIcon size={18} />
    </Link>
  )
}

function ApiStatus({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <span className="status-pill" role="status">
      <span className={ok ? 'status-pill__dot' : 'status-pill__dot status-pill__dot--off'} aria-hidden="true" />
      API: {text}
    </span>
  )
}

const ROUTE_STARTS = [
  { x: 45, y: 70 },
  { x: 125, y: 232 },
  { x: 260, y: 58 },
  { x: 395, y: 210 },
  { x: 468, y: 72 },
]

/** A picture of five starting points meeting at one fair town. Decorative only. */
function RouteFigure() {
  return (
    <div className="route-figure" aria-hidden="true">
      <div className="route-figure__bar">
        <span>Fairness map</span>
        <span className="route-figure__live">
          <span className="status-pill__dot" />
          one shared stop
        </span>
      </div>
      <div className="route-figure__map">
        <svg viewBox="0 0 520 300" preserveAspectRatio="xMidYMid meet">
          {ROUTE_STARTS.map((s) => (
            <path
              key={`${s.x}-${s.y}`}
              className="route-figure__route"
              d={`M${s.x} ${s.y} C${(s.x + 264) / 2} ${s.y}, ${(s.x + 264) / 2} 151, 264 151`}
            />
          ))}
          {ROUTE_STARTS.map((s) => (
            <circle key={`${s.x}-${s.y}`} className="route-figure__start" cx={s.x} cy={s.y} r="6" />
          ))}
          <circle className="route-figure__halo" cx="264" cy="151" r="30" />
          <circle className="route-figure__goal" cx="264" cy="151" r="20" />
          <path className="route-figure__check" d="M255 151l6 6 12-12" />
          <text className="route-figure__label" x="296" y="178">
            fairest town
          </text>
        </svg>
      </div>
      <div className="route-figure__bar">
        <span>5 starting points</span>
        <span>→ 1 shared destination</span>
      </div>
    </div>
  )
}

const STEPS = [
  {
    icon: MapPinIcon,
    title: 'Everyone shares their start',
    text: "Each member privately tells the planner where they're starting from and the longest drive they'd make.",
  },
  {
    icon: SparklesIcon,
    title: 'Tiny Bee finds the fairest towns',
    text: 'It ranks towns by drive time for the whole group, and you choose between the shortest longest drive and the least driving overall.',
  },
  {
    icon: CheckSquareIcon,
    title: 'Vote with ranked choice',
    text: 'The group shortlists a few places and ranks them on a private ballot. The count is shown round by round.',
  },
]

function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
      <div className="how__intro">
        <p className="eyebrow">
          <span className="eyebrow__line" aria-hidden="true" />
          How it works
        </p>
        <h2 id="how-title" className="display">
          Good plans start <span className="hero__soft">in the middle</span>
        </h2>
      </div>
      <ol className="steps-list">
        {STEPS.map((step, i) => (
          <li key={step.title} className="step">
            <span className="step__icon" aria-hidden="true">
              <step.icon size={22} />
            </span>
            <span className="step__number" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Points members to the page on connecting their own agent over MCP. */
function AgentCallout() {
  return (
    <aside className="agent-callout" aria-labelledby="agent-callout">
      <div>
        <p className="badge">
          <BotIcon size={14} /> For the technically curious
        </p>
        <h2 id="agent-callout" className="display">
          Plan with your own AI agent
        </h2>
        <p>
          Use Claude, Codex or another agent you already have? Connect it to tiny-bee and it can join your meetups, set
          your start and cast your vote once you approve.
        </p>
      </div>
      <Link to="/agents" className="button button--dark">
        How to connect your agent <ArrowRightIcon size={16} />
      </Link>
    </aside>
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

const startedOn = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function MyMeetups() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
      const created = await create.mutateAsync(value)
      formApi.reset()
      await navigate(`/m/${created.id}`)
    },
  })

  return (
    <>
      <section className="start-card" aria-labelledby="start-title">
        <div className="start-card__panel">
          <span className="start-card__plus" aria-hidden="true">
            <PlusIcon size={20} />
          </span>
          <h2 id="start-title">Start a meetup</h2>
          <p>Give it a name. The rest comes together as the group checks in.</p>
        </div>
        <form
          className="start-card__form"
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
              <button type="submit" className="button" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create'} <ArrowRightIcon size={16} />
              </button>
            )}
          </form.Subscribe>
          {create.error ? <span className="error">{create.error.message}</span> : null}
        </form>
      </section>

      <section aria-labelledby="your-meetups">
        <div className="section-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow__line" aria-hidden="true" />
              Your plans
            </p>
            <h2 id="your-meetups" className="display">
              Your meetups
            </h2>
          </div>
        </div>
        {meetups.isPending ? (
          <p className="muted">Loading…</p>
        ) : meetups.data?.length ? (
          <ul className="meetup-grid">
            {meetups.data.map((m) => (
              <li key={m.id}>
                <Link to={`/m/${m.id}`} className="meetup-card">
                  <span className="meetup-card__top">
                    <span className="tag">
                      <UsersIcon size={13} />
                      {m.role}
                    </span>
                    <ArrowRightIcon size={16} className="meetup-card__arrow" />
                  </span>
                  <span className="meetup-card__title">{m.title}</span>
                  <span className="meetup-card__meta muted small">Started {startedOn.format(m.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
      </section>
    </>
  )
}
