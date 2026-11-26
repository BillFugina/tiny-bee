import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '../../lib/trpc'

const sentDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/**
 * The addresses invited by email and whether each has joined. The organizer
 * sees every invite; other members see their own.
 */
export function SentInvites({ meetupId, userId }: { meetupId: string; userId?: string }) {
  const trpc = useTRPC()
  const invites = useQuery(trpc.invites.list.queryOptions({ meetupId }))

  if (!invites.data || invites.data.length === 0) return null
  const joined = invites.data.filter((i) => i.status === 'joined').length
  return (
    <details className="sent-invites">
      <summary>
        Email invites: {invites.data.length} sent, {joined} joined
      </summary>
      <ul className="plain">
        {invites.data.map((i) => (
          <li key={i.email} className="row spread">
            <span>{i.email}</span>
            <span className={i.status === 'joined' ? 'joined' : 'muted small'}>
              {i.status === 'joined' ? 'Joined' : `Invited ${sentDate.format(i.lastSentAt)}`}
              {i.timesSent > 1 ? ` (${i.timesSent} times)` : ''}
              {i.invitedBy.id === userId ? '' : ` by ${i.invitedBy.name}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
