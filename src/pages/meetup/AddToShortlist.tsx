import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { shortlistNoteField } from '../../../shared/schemas'
import { PlusIcon } from '../../components/icons'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'
import { useInvalidateMeetup } from './useInvalidateMeetup'

const noteForm = z.object({ note: shortlistNoteField })

export function AddToShortlist({ meetupId, townId }: { meetupId: string; townId: number }) {
  const trpc = useTRPC()
  const invalidate = useInvalidateMeetup()
  const [open, setOpen] = useState(false)
  const add = useMutation(trpc.shortlist.add.mutationOptions({ onSuccess: invalidate }))
  const form = useForm({
    defaultValues: { note: '' },
    validators: { onSubmit: noteForm },
    onSubmit: async ({ value }) => {
      await add.mutateAsync({ meetupId, townId, note: value.note || undefined })
      setOpen(false)
    },
  })

  if (!open) {
    return (
      <button type="button" className="button button--soft button--block" onClick={() => setOpen(true)}>
        <PlusIcon size={16} />
        Add to shortlist
      </button>
    )
  }
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="note">
        {(field) => (
          <label>
            Note for the group (optional)
            <input
              value={field.state.value}
              placeholder="Like a place to eat there"
              maxLength={200}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <div className="row">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add'}
            </button>
          )}
        </form.Subscribe>
        <button type="button" className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {add.error ? <span className="error">{add.error.message}</span> : null}
    </form>
  )
}
