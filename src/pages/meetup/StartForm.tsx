import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DRIVE_LIMIT, startFields } from '../../../shared/schemas'
import { MapPinIcon, NavigationIcon } from '../../components/icons'
import { formatMinutes } from '../../lib/format'
import { useDebounced } from '../../lib/useDebounced'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'

/** Where the member starts and the longest drive they'd make. */
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
      className="start-form"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="townId">
        {(field) => (
          <div className="autocomplete">
            <label className="field-label" htmlFor="start-town">
              Your starting point
            </label>
            <div className="search-field">
              <MapPinIcon size={18} />
              <input
                id="start-town"
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
            </div>
            {showSuggestions && suggestions.data?.length ? (
              <ul className="suggestions" role="listbox" aria-label="Matching towns">
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
                      <span className="suggestions__icon" aria-hidden="true">
                        <NavigationIcon size={15} />
                      </span>
                      {town.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {showSuggestions && query.length >= 2 && suggestions.data?.length === 0 ? (
              <span className="muted small">No towns match. Try the nearest larger town.</span>
            ) : null}
            <FieldErrors errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="maxMinutes">
        {(field) => (
          <div className="drive-field">
            <div className="drive-field__head">
              <label className="field-label" htmlFor="start-drive">
                Longest drive you'd make
              </label>
              <output className="pill-output" htmlFor="start-drive">
                {Number.isFinite(field.state.value) ? formatMinutes(field.state.value) : '–'}
              </output>
            </div>
            <input
              id="start-drive"
              type="range"
              min={DRIVE_LIMIT.min}
              max={DRIVE_LIMIT.max}
              step={5}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.valueAsNumber)}
            />
            <span className="scale muted small">
              <span>{formatMinutes(DRIVE_LIMIT.min)}</span>
              <span>{formatMinutes(DRIVE_LIMIT.max)}</span>
            </span>
            <FieldErrors errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <div className="row">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : props.start ? 'Update my start' : 'Save my start'}
            </button>
          )}
        </form.Subscribe>
        {save.isSuccess && !save.isPending ? <span className="muted small">Saved.</span> : null}
        {save.error ? <span className="error">{save.error.message}</span> : null}
      </div>
    </form>
  )
}
