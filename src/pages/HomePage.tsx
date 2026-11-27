import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { createMeetupInput } from '../../shared/schemas'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BotIcon,
  CalendarIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
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

  if (isPending) return <HomeHero />
  if (session) {
    return (
      <div className="home home--dashboard">
        <HomeHero lead={DASHBOARD_LEAD} />
        <MyMeetups status={status} />
        <AgentCallout />
      </div>
    )
  }
  return (
    <div className="home">
      <HomeHero action={<SignInPrompt />} status={status} figure />
      <HowItWorks />
      <AgentCallout />
    </div>
  )
}

const DASHBOARD_LEAD =
  'Tiny Bee makes getting everyone together feel easy. Start with a name, then let the group shape the plan.'

const VISITOR_LEAD =
  "Tiny Bee helps a group find a place to meet that's fair to everyone. Each member privately tells the planner where they're starting from and how far they'll drive, then Tiny Bee suggests the fairest towns, builds a shortlist and runs a ranked-choice vote."

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

function HomeHero(props: { lead?: string; figure?: boolean; action?: ReactNode; status?: ReactNode }) {
  return (
    <section className={props.figure ? 'hero hero--figure' : 'hero'} aria-labelledby="home-title">
      <div className="hero__copy">
        <p className="eyebrow">
          <SparklesIcon size={14} />
          Your next good plan
        </p>
        <h1 id="home-title" className="hero__title">
          Make time for the people you like.
        </h1>
        <p className="lead">{props.lead ?? VISITOR_LEAD}</p>
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
        <p className="kicker">How it works</p>
        <h2 id="how-title" className="display">
          Good plans start in the middle
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

type Phase = 'planning' | 'voting' | 'decided'

const PHASE_CARD: Record<Phase, { label: string; place: string; icon: typeof UsersIcon }> = {
  planning: { label: 'Gathering', place: 'Picking a place together', icon: UsersIcon },
  voting: { label: 'Voting', place: 'Voting on the shortlist', icon: SparklesIcon },
  decided: { label: 'Finished', place: 'Place decided', icon: CheckIcon },
}

function MyMeetups({ status }: { status: ReactNode }) {
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

  const count = meetups.data?.length ?? 0
  return (
    <>
      <section className="start-card" aria-labelledby="start-title">
        <div className="start-card__panel">
          <div>
            <span className="start-card__plus" aria-hidden="true">
              <PlusIcon size={20} />
            </span>
            <h2 id="start-title">Start a Meetup</h2>
            <p>Give the idea a name. The rest can come together as you go.</p>
          </div>
          <p className="start-card__note">
            <span className="start-card__dot" aria-hidden="true" />
            No group chat archaeology required.
          </p>
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
                Meetup name
                <input
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. Sunday market stroll"
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
              <button type="submit" className="button button--gradient" disabled={isSubmitting}>
                {isSubmitting ? 'Starting…' : 'Start planning'} <ArrowUpRightIcon size={16} />
              </button>
            )}
          </form.Subscribe>
          {create.error ? <span className="error">{create.error.message}</span> : null}
        </form>
      </section>

      <section aria-labelledby="your-meetups">
        <div className="section-head">
          <div>
            <p className="kicker">Your plans</p>
            <h2 id="your-meetups" className="section-title">
              Your Meetups
            </h2>
          </div>
          {count ? (
            <p className="muted small">{count === 1 ? '1 plan, old and new' : `${count} plans, old and new`}</p>
          ) : null}
        </div>
        {meetups.isPending ? (
          <p className="muted">Loading…</p>
        ) : meetups.data?.length ? (
          <ul className="meetup-grid">
            {meetups.data.map((m) => {
              const card = PHASE_CARD[m.phase]
              return (
                <li key={m.id}>
                  <Link to={`/m/${m.id}`} className="meetup-card">
                    <span className="meetup-card__top">
                      <span className={`tag tag--${m.phase}`}>
                        <card.icon size={13} />
                        {card.label}
                      </span>
                      <ArrowUpRightIcon size={16} className="meetup-card__arrow" />
                    </span>
                    <span className="meetup-card__title">{m.title}</span>
                    <span className="meetup-card__role">
                      {m.role === 'organizer' ? "You're organizing this one." : "You're in this one."}
                    </span>
                    <span className="meetup-card__facts">
                      <span>
                        <CalendarIcon size={15} />
                        Started {startedOn.format(m.createdAt)}
                      </span>
                      <span>
                        <MapPinIcon size={15} />
                        {card.place}
                      </span>
                      <span>
                        <UsersIcon size={15} />
                        {m.memberCount === 1 ? '1 member' : `${m.memberCount} members`}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty-note">No meetups yet. Start one above and share its link.</p>
        )}
        <p className="home-foot">
          <ClockIcon size={14} />
          Past meetups stay here as little reminders.
        </p>
        <div className="home-status">{status}</div>
      </section>
    </>
  )
}
