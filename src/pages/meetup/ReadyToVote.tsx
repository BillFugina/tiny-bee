import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { VOTING_MAX_DAYS } from '../../../shared/schemas'
import { CalendarIcon, ClockIcon } from '../../components/icons'
import { CLOSE_HOURS, chosenDeadline, dayKey, dayOptions, hourLabel, isOpen } from '../../lib/closeVoting'
import { useTRPC } from '../../lib/trpc'
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
  const [day, setDay] = useState<string | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  const [otherDay, setOtherDay] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const days = dayOptions(now, 6)
  const deadline = chosenDeadline({ day, hour }, now, VOTING_MAX_DAYS)
  const customDay = day && !days.some((d) => d.key === day) ? day : null
  const latest = dayKey(new Date(now.getTime() + VOTING_MAX_DAYS * 24 * 60 * 60 * 1000))

  const pickDay = (key: string | null) => {
    setError(null)
    setDay(key)
    // A time that's already past on the new day falls back to that day's default.
    if (key && hour !== null && !isOpen(key, hour, now, VOTING_MAX_DAYS)) setHour(null)
  }
  const submit = () => {
    if ((day || hour !== null) && (!deadline || deadline.getTime() <= new Date().getTime())) {
      setError('Pick a time in the future')
      return
    }
    open.mutate({ meetupId, deadline })
  }

  return (
    <form
      className="ready-box__form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p>Once voting opens, the shortlist can't change.</p>
      <fieldset className="close-picker">
        <legend>Close voting at (optional)</legend>
        <p className="close-picker__label">
          <CalendarIcon size={14} />
          Date
        </p>
        <div className="close-picker__days">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              className="close-chip"
              aria-pressed={day === d.key}
              onClick={() => pickDay(day === d.key ? null : d.key)}
            >
              <strong>{d.label}</strong>
              <span>{d.detail}</span>
            </button>
          ))}
        </div>
        {otherDay || customDay ? (
          <label className="close-picker__other">
            <span className="sr-only">Another date</span>
            <input
              type="date"
              value={customDay ?? ''}
              min={days.at(-1)?.key}
              max={latest}
              onChange={(e) => pickDay(e.target.value || null)}
            />
          </label>
        ) : (
          <button type="button" className="link close-picker__more" onClick={() => setOtherDay(true)}>
            Another date
          </button>
        )}
        <p className="close-picker__label">
          <ClockIcon size={14} />
          Time
        </p>
        <div className="close-picker__times">
          {CLOSE_HOURS.map((h) => {
            const usable = day ? isOpen(day, h, now, VOTING_MAX_DAYS) : true
            return (
              <button
                key={h}
                type="button"
                className="close-chip close-chip--time"
                aria-pressed={hour === h}
                disabled={!usable}
                onClick={() => {
                  setError(null)
                  setHour(hour === h ? null : h)
                }}
              >
                {hourLabel(h)}
              </button>
            )
          })}
        </div>
        <p className="close-picker__summary" aria-live="polite">
          <span>{deadline ? `Closes ${summary.format(deadline)}` : 'Closes when everyone has voted'}</span>
          {day || hour !== null ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                setDay(null)
                setHour(null)
                setOtherDay(false)
                setError(null)
              }}
            >
              Clear
            </button>
          ) : null}
        </p>
      </fieldset>
      {error ? <span className="error">{error}</span> : null}
      <button type="submit" className="button button--light" disabled={open.isPending}>
        {open.isPending ? 'Opening…' : 'Open voting'}
      </button>
      {open.error ? <span className="error">{open.error.message}</span> : null}
    </form>
  )
}

const summary = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
