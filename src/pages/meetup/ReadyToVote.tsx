import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { VOTING_MAX_DAYS } from '../../../shared/schemas'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'
import { useInvalidateMeetup } from './useInvalidateMeetup'

/** Under the shortlist while planning: how the group moves on to the vote. */
export function ReadyToVote({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const status = useQuery(trpc.vote.status.queryOptions({ meetupId }))
  if (!status.data || status.data.phase !== 'planning') return null
  const s = status.data
  return (
    <section className="ready-box" aria-labelledby="ready-title">
      <h3 id="ready-title">Ready when you are</h3>
      {s.canOpen ? (
        <OpenVoting meetupId={meetupId} />
      ) : s.isOrganizer ? (
        <>
          <p>Shortlist at least two places, then open voting here.</p>
          <button type="button" className="button button--light" disabled>
            Open voting
          </button>
        </>
      ) : (
        <p>The organizer opens voting once the shortlist is ready.</p>
      )}
    </section>
  )
}

function OpenVoting({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const invalidate = useInvalidateMeetup()
  const open = useMutation(trpc.vote.open.mutationOptions({ onSuccess: invalidate }))
  const form = useForm({
    defaultValues: { deadline: '' },
    onSubmit: async ({ value }) => {
      await open.mutateAsync({ meetupId, deadline: value.deadline ? new Date(value.deadline) : null })
    },
  })

  return (
    <form
      className="ready-box__form"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <p>Once voting opens, the shortlist can't change.</p>
      <form.Field
        name="deadline"
        validators={{
          onSubmit: ({ value }) => {
            if (!value) return undefined
            const when = new Date(value).getTime()
            if (Number.isNaN(when) || when <= Date.now()) return 'Pick a time in the future'
            if (when - Date.now() > VOTING_MAX_DAYS * 24 * 60 * 60 * 1000) {
              return `Voting can stay open ${VOTING_MAX_DAYS} days at most`
            }
            return undefined
          },
        }}
      >
        {(field) => (
          <label>
            Close voting at (optional)
            <input
              type="datetime-local"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <span className="muted small">Leave it empty to close when everyone has voted.</span>
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" className="button button--light" disabled={isSubmitting}>
            {isSubmitting ? 'Opening…' : 'Open voting'}
          </button>
        )}
      </form.Subscribe>
      {open.error ? <span className="error">{open.error.message}</span> : null}
    </form>
  )
}
