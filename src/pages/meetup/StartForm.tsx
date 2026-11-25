import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DRIVE_LIMIT, startFields } from '../../../shared/schemas'
import { useDebounced } from '../../lib/useDebounced'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'

export function StartForm(props: {
  meetupId: string
  start: { townId: number; label: string } | null
  maxMinutes: number | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [townText, setTownText] = useState(props.start?.label ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const query = useDebounced(townText.trim(), 250)
  const suggestions = useQuery(
    trpc.places.search.queryOptions({ q: query }, { enabled: showSuggestions && query.length >= 2 }),
  )
  const save = useMutation(
    trpc.meetups.setMyStart.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.meetups.pathKey() }),
    }),
  )

  const form = useForm({
    defaultValues: { townId: props.start?.townId ?? 0, maxMinutes: props.maxMinutes ?? 60 },
    validators: { onSubmit: startFields },
    onSubmit: async ({ value }) => {
      await save.mutateAsync({ meetupId: props.meetupId, ...value })
    },
  })

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h2>Your starting point</h2>
      <form.Field name="townId">
        {(field) => (
          <label className="autocomplete">
            Town you're leaving from
            <input
              value={townText}
              autoComplete="off"
              placeholder="Start typing a town"
              onChange={(e) => {
                setTownText(e.target.value)
                setShowSuggestions(true)
                field.handleChange(0)
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && suggestions.data?.length ? (
              <ul className="suggestions" role="listbox">
                {suggestions.data.map((town) => (
                  <li key={town.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        field.handleChange(town.id)
                        setTownText(town.label)
                        setShowSuggestions(false)
                      }}
                    >
                      {town.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {showSuggestions && query.length >= 2 && suggestions.data?.length === 0 ? (
              <span className="muted">No towns match. Try the nearest larger town.</span>
            ) : null}
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Field name="maxMinutes">
        {(field) => (
          <label>
            Longest drive you'd make (minutes)
            <input
              type="number"
              inputMode="numeric"
              min={DRIVE_LIMIT.min}
              max={DRIVE_LIMIT.max}
              step={5}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.valueAsNumber)}
            />
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : props.start ? 'Update' : 'Save'}
          </button>
        )}
      </form.Subscribe>
      {save.error ? <span className="error">{save.error.message}</span> : null}
    </form>
  )
}
