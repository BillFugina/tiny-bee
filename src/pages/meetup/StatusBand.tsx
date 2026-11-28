import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ChevronLeftIcon, ClockIcon, ShareIcon, UsersIcon } from '../../components/icons'
import { useTRPC } from '../../lib/trpc'

export type Stage = 'gathering' | 'shortlisting' | 'voting' | 'decided'

const STAGE_LABEL: Record<Stage, string> = {
  gathering: 'Gathering members',
  shortlisting: 'Shortlisting towns',
  voting: 'Voting in progress',
  decided: 'Meetup decided',
}

const closesAt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** The band under the site header on a meetup page: title, stage, members and the invite button. */
export function StatusBand(props: {
  meetupId: string
  title: string
  stage: Stage
  memberCount: number
  inviteOpen: boolean
  onToggleInvite: () => void
  /** Set while there's an earlier step to go back to; otherwise back goes to the meetups list. */
  back?: { label: string; onBack: () => void }
}) {
  const trpc = useTRPC()
  const vote = useQuery(trpc.vote.status.queryOptions({ meetupId: props.meetupId }))
  const deadline = props.stage === 'voting' ? vote.data?.deadline : null

  return (
    <header className="status-band">
      <div className="status-band__inner">
        <div className="status-band__title">
          {props.back ? (
            <button
              type="button"
              className="round-button"
              aria-label={`Back to ${props.back.label}`}
              title={`Back to ${props.back.label}`}
              onClick={props.back.onBack}
            >
              <ChevronLeftIcon size={20} />
            </button>
          ) : (
            <Link to="/" className="round-button" aria-label="Back to your meetups" title="Back to your meetups">
              <ChevronLeftIcon size={20} />
            </Link>
          )}
          <div className="status-band__text">
            <h1>{props.title}</h1>
            <p className="status-band__meta">
              <span className={`stage stage--${props.stage}`}>
                <span className="stage__dot" aria-hidden="true" />
                {STAGE_LABEL[props.stage]}
              </span>
              <span className="status-band__count">
                <UsersIcon size={14} />
                {props.memberCount === 1 ? '1 member' : `${props.memberCount} members`}
              </span>
            </p>
          </div>
        </div>
        <div className="status-band__actions">
          {deadline ? (
            <span className="status-band__when">
              <ClockIcon size={14} />
              Voting closes {closesAt.format(deadline)}
            </span>
          ) : null}
          <button
            type="button"
            className="button button--invite"
            aria-expanded={props.inviteOpen}
            aria-controls="invite-panel"
            onClick={props.onToggleInvite}
          >
            <ShareIcon size={16} />
            Invite link
          </button>
        </div>
      </div>
    </header>
  )
}
