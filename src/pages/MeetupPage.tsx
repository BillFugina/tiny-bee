import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useActiveMeetupTitle } from '../lib/activeMeetup'
import { authClient } from '../lib/auth-client'
import {
  currentStep,
  nextStep,
  planSteps,
  previousStep,
  STEP_LABEL,
  stepOpen,
  type PlanContext,
  type PlanStep,
} from '../lib/meetupView'
import { useTRPC } from '../lib/trpc'
import { FairAreas } from './meetup/FairAreas'
import { InvitePanel } from './meetup/InvitePanel'
import { MoreTools } from './meetup/MoreTools'
import { Planner } from './meetup/Planner'
import { ReadyToVote } from './meetup/ReadyToVote'
import { Results } from './meetup/Results'
import { Shortlist } from './meetup/Shortlist'
import { StatusBand, type Stage } from './meetup/StatusBand'
import { Vote } from './meetup/Vote'
import { useLiveMeetup } from './meetup/useLiveMeetup'
import { ArrowRightIcon, SparklesIcon, UsersIcon } from '../components/icons'

export function MeetupPage() {
  const { meetupId = '' } = useParams()
  const location = useLocation()
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <p className="muted">Loading…</p>
  if (!session) {
    return (
      <section className="card narrow">
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
      <section className="card narrow">
        <h1>Meetup not found</h1>
        <p className="muted">Check the link, or ask whoever shared it for a new one.</p>
        <Link to="/">Back to your meetups</Link>
      </section>
    )
  }
  if (!preview.data.isMember) {
    const { title, organizer, memberCount } = preview.data
    return (
      <section className="card narrow">
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
  useLiveMeetup(meetupId)
  useActiveMeetupTitle(meetup.data?.title ?? '')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [params, setParams] = useSearchParams()

  const members = meetup.data?.members ?? []
  const phase = meetup.data?.phase
  const me = members.find((m) => m.isMe)
  const ctx: PlanContext = {
    isOrganizer: me?.role === 'organizer',
    meReady: !!(me?.start && me.maxMinutes),
    ready: members.filter((m) => m.start && m.maxMinutes).length,
  }
  const asked = params.get('step')
  const step = currentStep(asked, ctx)

  // Pin the step a visit starts on, so saving a start from the chat doesn't
  // swap the page out from under the conversation.
  const shouldPin = phase === 'planning' && !!me && asked === null
  useEffect(() => {
    if (!shouldPin) return
    setParams(
      (p) => {
        p.set('step', step)
        return p
      },
      { replace: true },
    )
  }, [shouldPin, step, setParams])

  if (meetup.isPending) return <p className="muted">Loading…</p>
  if (!meetup.data) return <p className="error">{meetup.error?.message ?? 'Could not load this meetup.'}</p>

  const { title } = meetup.data
  const stage: Stage =
    phase === 'decided' ? 'decided' : phase === 'voting' ? 'voting' : ctx.ready < 2 ? 'gathering' : 'shortlisting'
  const steps = planSteps(ctx.isOrganizer)
  const goTo = (next: PlanStep) => {
    setParams((p) => {
      p.set('step', next)
      return p
    })
    window.scrollTo({ top: 0 })
  }
  const kicker = `Step ${steps.indexOf(step) + 1} of ${steps.length}`
  const after = nextStep(step, ctx.isOrganizer)
  const nextButton =
    after && stepOpen(after, ctx) ? (
      <button type="button" className="button" onClick={() => goTo(after)}>
        {after === 'invite' ? 'Next: invite your group' : 'See the fairest towns'}
        <ArrowRightIcon size={16} />
      </button>
    ) : after === 'towns' ? (
      <p className="muted small">
        {ctx.ready === 0 || (ctx.ready === 1 && ctx.meReady)
          ? 'The fairest towns open once someone else adds a starting point. This page updates on its own.'
          : 'The fairest towns open once two members have a starting point.'}
      </p>
    ) : null

  const openOffered = (target: PlanStep) => {
    if (stepOpen(target, ctx)) goTo(target)
  }
  const planner = me ? <Planner meetupId={meetupId} me={me} onOffer={openOffered} /> : null
  let body
  if (phase === 'planning') {
    const nav = <StepNav steps={steps} current={step} ctx={ctx} onGo={goTo} />
    if (step === 'start') {
      body = (
        <div className="setup">
          {nav}
          {me ? <Planner meetupId={meetupId} me={me} kicker={kicker} onOffer={openOffered} /> : null}
          {ctx.meReady ? <div className="step-next">{nextButton}</div> : null}
        </div>
      )
    } else if (step === 'invite') {
      body = (
        <div className="setup setup--wide">
          {nav}
          <header className="view-head view-head--center">
            <p className="kicker kicker--icon">
              <UsersIcon size={16} />
              {kicker}
            </p>
            <h2 className="view-title">Invite your group.</h2>
            <p className="view-lead">
              Send the link to everyone coming. Each person tells their own planner where they're starting from.
            </p>
          </header>
          <InvitePanel meetupId={meetupId} title={title} members={members} />
          <div className="step-next">{nextButton}</div>
        </div>
      )
    } else {
      body = (
        <div className="discovery">
          {nav}
          <div className="view-head">
            <p className="kicker kicker--icon">
              <SparklesIcon size={16} />
              {kicker}
            </p>
            <h2 className="view-title">Find the fairest town for everyone.</h2>
            <p className="view-lead">
              Tiny Bee matched everyone's starting points and found a few places in between. Add the towns your group
              would be happy to visit.
            </p>
          </div>
          <FairAreas
            meetupId={meetupId}
            aside={
              <aside className="discovery__side" aria-label="Shortlist">
                <Shortlist meetupId={meetupId} />
                <ReadyToVote meetupId={meetupId} />
              </aside>
            }
          />
        </div>
      )
    }
  } else {
    body = (
      <>
        {phase === 'voting' && me ? <Vote meetupId={meetupId} userId={me.userId} /> : null}
        {phase === 'decided' ? <Results meetupId={meetupId} /> : null}
        <MoreTools planner={planner} meetupId={meetupId} />
      </>
    )
  }

  const before = phase === 'planning' ? previousStep(step, ctx.isOrganizer) : null
  return (
    <div className="meetup">
      <StatusBand
        meetupId={meetupId}
        title={title}
        stage={stage}
        memberCount={members.length}
        inviteOpen={inviteOpen}
        onToggleInvite={() => setInviteOpen((open) => !open)}
        back={before ? { label: STEP_LABEL[before].toLowerCase(), onBack: () => goTo(before) } : undefined}
      />
      {inviteOpen && !(phase === 'planning' && step === 'invite') ? (
        <InvitePanel meetupId={meetupId} title={title} members={members} />
      ) : null}
      {body}
    </div>
  )
}

/** The row of planning steps; open ones can be jumped to, the towns wait for two starting points. */
function StepNav(props: { steps: PlanStep[]; current: PlanStep; ctx: PlanContext; onGo: (step: PlanStep) => void }) {
  return (
    <nav className="step-nav" aria-label="Planning steps">
      <ol>
        {props.steps.map((s, i) => {
          const open = stepOpen(s, props.ctx)
          const here = s === props.current
          return (
            <li key={s}>
              <button
                type="button"
                className={`step-nav__step${here ? ' is-current' : ''}`}
                aria-current={here ? 'step' : undefined}
                disabled={!open}
                title={open ? undefined : 'Opens once two members have a starting point'}
                onClick={() => props.onGo(s)}
              >
                <span className="step-nav__num" aria-hidden="true">
                  {i + 1}
                </span>
                {STEP_LABEL[s]}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
