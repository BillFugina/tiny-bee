import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { VOTING_MAX_DAYS } from '../../../shared/schemas'
import { readBallotToken, saveBallotToken } from '../../lib/ballotToken'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'
import { Results } from './Results'
import { useInvalidateMeetup } from './useInvalidateMeetup'

export function Vote({ meetupId, userId }: { meetupId: string; userId: string }) {
  const trpc = useTRPC()
  const status = useQuery(trpc.vote.status.queryOptions({ meetupId }))

  if (!status.data) return status.error ? <p className="error">{status.error.message}</p> : null
  const s = status.data

  if (s.phase === 'decided' && s.result) {
    return <Results result={s.result} turnout={s.turnout} />
  }

  if (s.phase === 'planning') {
    return (
      <div className="card">
        <h2>Vote</h2>
        {s.canOpen ? (
          <OpenVoting meetupId={meetupId} />
        ) : s.isOrganizer ? (
          <p className="muted">Shortlist at least two places, then open voting here.</p>
        ) : (
          <p className="muted">The organizer opens voting once the shortlist is ready.</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Vote</h2>
      <p>
        Rank the places you'd go to, best first. You can leave out any you wouldn't go to.
        {s.deadline ? ` Voting closes ${s.deadline.toLocaleString()}.` : ' Voting closes when everyone has voted.'}
      </p>
      <p className="muted small">
        {s.turnout.voted} of {s.turnout.members} have voted. Nobody sees how anyone voted, and there are no running
        totals.
      </p>
      <Ballot meetupId={meetupId} userId={userId} candidates={s.candidates} iVoted={s.iVoted} />
      {s.canClose ? <CloseVoting meetupId={meetupId} /> : null}
    </div>
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
      className="inline-form"
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
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Opening…' : 'Open voting'}
          </button>
        )}
      </form.Subscribe>
      {open.error ? <span className="error">{open.error.message}</span> : null}
    </form>
  )
}

type Candidate = { id: string; label: string }

function Ballot(props: { meetupId: string; userId: string; candidates: Candidate[]; iVoted: boolean }) {
  const trpc = useTRPC()
  const [token, setToken] = useState(() => readBallotToken(props.meetupId, props.userId))
  const mine = useQuery(
    trpc.vote.mine.queryOptions({ meetupId: props.meetupId, token: token ?? '' }, { enabled: !!token }),
  )

  if (props.iVoted && !token) {
    return <p>Your vote is in. This browser can't change it, because the ballot was cast from another one.</p>
  }
  if (token && mine.isPending) return <p className="muted">Loading your ballot…</p>
  return (
    <BallotForm
      key={token ?? 'new'}
      {...props}
      token={token}
      initial={mine.data?.ranking ?? []}
      onCast={(next) => {
        saveBallotToken(props.meetupId, props.userId, next)
        setToken(next)
      }}
    />
  )
}

function BallotForm(props: {
  meetupId: string
  candidates: Candidate[]
  token: string | null
  initial: string[]
  onCast: (token: string) => void
}) {
  const trpc = useTRPC()
  const invalidate = useInvalidateMeetup()
  const valid = new Set(props.candidates.map((c) => c.id))
  const [ranking, setRanking] = useState(() => props.initial.filter((id) => valid.has(id)))
  const [saved, setSaved] = useState(props.token !== null)
  const cast = useMutation(
    trpc.vote.cast.mutationOptions({
      onSuccess: (result) => {
        setSaved(true)
        props.onCast(result.token)
        void invalidate()
      },
    }),
  )
  const labels = new Map(props.candidates.map((c) => [c.id, c.label]))
  const unranked = props.candidates.filter((c) => !ranking.includes(c.id))

  const update = (next: string[]) => {
    setRanking(next)
    setSaved(false)
  }
  const move = (index: number, by: number) => {
    const next = [...ranking]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item!)
    update(next)
  }

  return (
    <div className="ballot">
      {ranking.length ? (
        <ol className="ranked">
          {ranking.map((id, i) => (
            <li key={id}>
              <span>{labels.get(id)}</span>
              <span className="row">
                <button
                  type="button"
                  className="icon"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label="Move down"
                  disabled={i === ranking.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button type="button" className="link" onClick={() => update(ranking.filter((r) => r !== id))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Pick your first choice below.</p>
      )}
      {unranked.length ? (
        <div className="row wrap">
          {unranked.map((c) => (
            <button key={c.id} type="button" className="chip" onClick={() => update([...ranking, c.id])}>
              + {c.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="row">
        <button
          type="button"
          disabled={ranking.length === 0 || cast.isPending || saved}
          onClick={() => cast.mutate({ meetupId: props.meetupId, ranking, token: props.token ?? undefined })}
        >
          {cast.isPending ? 'Saving…' : props.token ? 'Change my vote' : 'Cast my vote'}
        </button>
        {saved && props.token ? (
          <span className="muted small">Saved. You can change it until voting closes.</span>
        ) : null}
      </div>
      {cast.error ? <span className="error">{cast.error.message}</span> : null}
    </div>
  )
}

function CloseVoting({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const invalidate = useInvalidateMeetup()
  const close = useMutation(trpc.vote.close.mutationOptions({ onSuccess: invalidate }))
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" className="link" onClick={() => setConfirming(true)}>
        Close voting now
      </button>
    )
  }
  return (
    <div className="row wrap">
      <span>Close voting and count the ballots now? Anyone who hasn't voted won't be counted.</span>
      <button type="button" disabled={close.isPending} onClick={() => close.mutate({ meetupId })}>
        {close.isPending ? 'Closing…' : 'Close and count'}
      </button>
      <button type="button" className="link" onClick={() => setConfirming(false)}>
        Keep it open
      </button>
      {close.error ? <span className="error">{close.error.message}</span> : null}
    </div>
  )
}
