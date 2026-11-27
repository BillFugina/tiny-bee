import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'
import { authClient } from '../lib/auth-client'
import { formatMinutes } from '../lib/format'
import { ArrowLeftIcon, UsersIcon } from '../components/icons'
import { useTRPC } from '../lib/trpc'
import { CheckIn } from './meetup/CheckIn'
import { FairAreas } from './meetup/FairAreas'
import { InviteByEmail } from './meetup/InviteByEmail'
import { SentInvites } from './meetup/SentInvites'
import { ShareLink } from './meetup/ShareLink'
import { Shortlist } from './meetup/Shortlist'
import { StartForm } from './meetup/StartForm'
import { Vote } from './meetup/Vote'
import { useLiveMeetup } from './meetup/useLiveMeetup'

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

  if (meetup.isPending) return <p className="muted">Loading…</p>
  if (!meetup.data) return <p className="error">{meetup.error?.message ?? 'Could not load this meetup.'}</p>

  const me = meetup.data.members.find((m) => m.isMe)
  const phase = meetup.data.phase
  const planning = phase === 'planning'
  const vote = me ? <Vote meetupId={meetupId} userId={me.userId} /> : null
  const startForm = me ? (
    <StartForm
      key={`${me.start?.townId ?? 0}-${me.maxMinutes ?? 0}`}
      meetupId={meetupId}
      start={me.start}
      maxMinutes={me.maxMinutes}
    />
  ) : null
  const memberCount = meetup.data.members.length
  return (
    <div className="meetup">
      <header className="meetup-head">
        <Link to="/" className="icon-button" aria-label="Back to your meetups">
          <ArrowLeftIcon size={18} />
        </Link>
        <div className="meetup-head__text">
          <h1>{meetup.data.title}</h1>
          <p className="meetup-head__meta">
            <span className="tag tag--phase">{PHASE_LABEL[phase]}</span>
            <span className="muted small meetup-head__count">
              <UsersIcon size={14} />
              {memberCount === 1 ? '1 member' : `${memberCount} members`}
            </span>
          </p>
        </div>
      </header>

      <div className="meetup-layout">
        <section className="card meetup-invite" aria-labelledby="invite-title">
          <h2 id="invite-title">Invite friends</h2>
          <p className="muted small">Invite friends with this link. Anyone who has it can join.</p>
          <ShareLink title={meetup.data.title} />
          <InviteByEmail meetupId={meetupId} />
          <SentInvites meetupId={meetupId} userId={me?.userId} />
        </section>

        <div className="meetup-main stack">
          {planning ? (
            <>
              <CheckIn meetupId={meetupId} />
              {startForm}
              <FairAreas meetupId={meetupId} />
              {vote}
            </>
          ) : (
            <>
              {vote}
              {startForm}
              <FairAreas meetupId={meetupId} />
              <CheckIn meetupId={meetupId} />
            </>
          )}
        </div>

        <aside className="meetup-side stack">
          <Shortlist meetupId={meetupId} />
          <div className="card">
            <h2>Who's coming</h2>
            <ul className="plain members">
              {meetup.data.members.map((m) => (
                <li key={m.userId}>
                  <span className="avatar" aria-hidden="true">
                    {(m.name.trim()[0] ?? '?').toUpperCase()}
                  </span>
                  <span>
                    <strong>{m.isMe ? `${m.name} (you)` : m.name}</strong>
                    {m.role === 'organizer' ? <span className="muted"> · organizer</span> : null}
                    <br />
                    <span className="muted small">
                      {m.start && m.maxMinutes
                        ? `From ${m.start.label}, up to ${formatMinutes(m.maxMinutes)}`
                        : 'No starting point yet'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

const PHASE_LABEL = { planning: 'Planning', voting: 'Voting open', decided: 'Decided' } as const
