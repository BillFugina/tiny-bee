import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../server/routers/index.js'
import { formatMinutes } from '../../lib/format'
import { InviteByEmail } from './InviteByEmail'
import { SentInvites } from './SentInvites'
import { ShareLink } from './ShareLink'

type Member = inferRouterOutputs<AppRouter>['meetups']['get']['members'][number]

/** Opened by the Invite link button: the link, email invites, and who's in so far. */
export function InvitePanel({ meetupId, title, members }: { meetupId: string; title: string; members: Member[] }) {
  const me = members.find((m) => m.isMe)
  return (
    <section id="invite-panel" className="invite-panel" aria-labelledby="invite-title">
      <div className="invite-panel__invite">
        <h2 id="invite-title">Invite friends</h2>
        <p className="muted small">Anyone who has this link can join.</p>
        <ShareLink title={title} />
        <InviteByEmail meetupId={meetupId} />
        <SentInvites meetupId={meetupId} userId={me?.userId} />
      </div>
      <div className="invite-panel__members">
        <h2>Who's coming</h2>
        <ul className="plain members">
          {members.map((m) => (
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
    </section>
  )
}
