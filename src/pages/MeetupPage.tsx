import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useActiveMeetupTitle } from '../lib/activeMeetup'
import { authClient } from '../lib/auth-client'
import { showSetup } from '../lib/meetupView'
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
import { SparklesIcon } from '../components/icons'

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
  const [lookAround, setLookAround] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [beganInSetup, setBeganInSetup] = useState(false)

  if (meetup.isPending) return <p className="muted">Loading…</p>
  if (!meetup.data) return <p className="error">{meetup.error?.message ?? 'Could not load this meetup.'}</p>

  const { members, phase, title } = meetup.data
  const me = members.find((m) => m.isMe)
  const ready = members.filter((m) => m.start && m.maxMinutes).length
  const meReady = !!(me?.start && me.maxMinutes)
  const stage: Stage =
    phase === 'decided' ? 'decided' : phase === 'voting' ? 'voting' : ready < 2 ? 'gathering' : 'shortlisting'

  // Remember that this visit began in the planner, so saving a start from the
  // chat doesn't swap the page out from under the conversation.
  if (phase === 'planning' && !meReady && !lookAround && !beganInSetup) setBeganInSetup(true)

  const planner = me ? <Planner meetupId={meetupId} me={me} /> : null
  let body
  if (showSetup({ phase, meReady, lookAround, beganInSetup })) {
    body = (
      <div className="setup">
        {planner}
        {meReady ? (
          <p className="setup__skip">
            <button type="button" className="button" onClick={() => setLookAround(true)}>
              See the fairest towns
            </button>
          </p>
        ) : ready >= 2 ? (
          <p className="setup__skip">
            <button type="button" className="link" onClick={() => setLookAround(true)}>
              Look at the fairest towns first
            </button>
          </p>
        ) : null}
      </div>
    )
  } else if (phase === 'planning') {
    body = (
      <div className="discovery">
        <div className="view-head view-head--split">
          <div>
            <p className="kicker kicker--icon">
              <SparklesIcon size={16} />
              Step 2 of 3
            </p>
            <h2 className="view-title">Find the fairest town for everyone.</h2>
            <p className="view-lead">
              Tiny Bee matched everyone's starting points and found a few places in between. Add the towns your group
              would be happy to visit.
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            aria-expanded={plannerOpen}
            onClick={() => setPlannerOpen((open) => !open)}
          >
            <SparklesIcon size={16} />
            {plannerOpen ? 'Hide your planner' : meReady ? 'Talk to your planner' : 'Add your starting point'}
          </button>
        </div>
        {plannerOpen ? <div className="discovery__planner">{planner}</div> : null}
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
  } else {
    body = (
      <>
        {phase === 'voting' && me ? <Vote meetupId={meetupId} userId={me.userId} /> : null}
        {phase === 'decided' ? <Results meetupId={meetupId} /> : null}
        <MoreTools planner={planner} meetupId={meetupId} />
      </>
    )
  }

  return (
    <div className="meetup">
      <StatusBand
        meetupId={meetupId}
        title={title}
        stage={stage}
        memberCount={members.length}
        inviteOpen={inviteOpen}
        onToggleInvite={() => setInviteOpen((open) => !open)}
      />
      {inviteOpen ? <InvitePanel meetupId={meetupId} title={title} members={members} /> : null}
      {body}
    </div>
  )
}
