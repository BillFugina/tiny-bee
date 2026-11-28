import { useMutation, useQuery } from '@tanstack/react-query'
import { MapPinIcon, UsersIcon, XIcon } from '../../components/icons'
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
    <section className="card shortlist" aria-labelledby="shortlist-title">
      <header className="shortlist__head">
        <div>
          <h3 id="shortlist-title">
            Shortlist <span className="count-pill">{items.length}</span>
          </h3>
          <p className="muted small">Towns the group is considering</p>
        </div>
        <span className="shortlist__icon" aria-hidden="true">
          <UsersIcon size={18} />
        </span>
      </header>
      {items.length === 0 ? (
        <p className="shortlist__empty">Nothing yet. Add towns from the fairest list.</p>
      ) : (
        <ul className="shortlist__items">
          {items.map((item) => (
            <li key={item.id} className="shortlist__item">
              <span className="shortlist__pin" aria-hidden="true">
                <MapPinIcon size={16} />
              </span>
              <span className="shortlist__text">
                <strong>{item.label}</strong>
                <span className="muted small">Added by {item.addedBy}</span>
                {item.note ? <span className="shortlist__note">{item.note}</span> : null}
              </span>
              {item.canRemove ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${item.label}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ meetupId, itemId: item.id })}
                >
                  <XIcon size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {phase === 'planning' ? (
        <p className="muted small">
          {items.length} of {max} places.
        </p>
      ) : null}
      {remove.error ? <span className="error">{remove.error.message}</span> : null}
    </section>
  )
}
