import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '../../lib/trpc'
import { useInvalidateMeetup } from './useInvalidateMeetup'

export function Shortlist({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const invalidate = useInvalidateMeetup()
  const shortlist = useQuery(trpc.shortlist.list.queryOptions({ meetupId }))
  const remove = useMutation(trpc.shortlist.remove.mutationOptions({ onSuccess: invalidate }))

  if (!shortlist.data) {
    return shortlist.error ? <p className="error">{shortlist.error.message}</p> : null
  }
  const { items, max, phase } = shortlist.data
  return (
    <div className="card">
      <h2>Shortlist</h2>
      {items.length === 0 ? (
        <p className="muted">Nothing yet. Add places from the fairest list below.</p>
      ) : (
        <ul className="plain">
          {items.map((item) => (
            <li key={item.id} className="row spread">
              <span>
                <strong>{item.label}</strong>
                <span className="muted small"> · added by {item.addedBy}</span>
                {item.note ? (
                  <>
                    <br />
                    <span className="muted">{item.note}</span>
                  </>
                ) : null}
              </span>
              {item.canRemove ? (
                <button
                  type="button"
                  className="link"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ meetupId, itemId: item.id })}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {phase === 'planning' ? (
        <p className="muted small">
          {items.length} of {max} places. The group votes on this list once the organizer opens voting.
        </p>
      ) : null}
      {remove.error ? <span className="error">{remove.error.message}</span> : null}
    </div>
  )
}
