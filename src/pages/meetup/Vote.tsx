import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  InfoIcon,
  MapPinIcon,
  PlusIcon,
  VoteIcon,
  XIcon,
} from '../../components/icons'
import { readBallotToken, saveBallotToken } from '../../lib/ballotToken'
import { useTRPC } from '../../lib/trpc'
import { useInvalidateMeetup } from './useInvalidateMeetup'

const closesAt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** The voting screen: rank the shortlist and cast or change your ballot. */
export function Vote({ meetupId, userId }: { meetupId: string; userId: string }) {
  const trpc = useTRPC()
  const status = useQuery(trpc.vote.status.queryOptions({ meetupId }))
  const queryClient = useQueryClient()
  const closed = !!status.data && status.data.phase !== 'voting'
  useEffect(() => {
    // A passed deadline closes the vote when status is read, without a live
    // update; refresh the meetup so the page moves on to the results.
    if (closed) void queryClient.invalidateQueries({ queryKey: trpc.meetups.pathKey() })
  }, [closed, queryClient, trpc])

  if (!status.data) return status.error ? <p className="error">{status.error.message}</p> : null
  const s = status.data
  if (s.phase !== 'voting') return null

  return (
    <section className="voting" aria-labelledby="voting-title">
      <header className="voting__head">
        <span className="voting__mark" aria-hidden="true">
          <VoteIcon size={24} />
        </span>
        <p className="kicker">Your turn</p>
        <h2 id="voting-title" className="view-title">
          Where should we meet?
        </h2>
        <p className="view-lead">Rank the places you'd go to, best first. You can leave out any you wouldn't go to.</p>
      </header>
      <Ballot meetupId={meetupId} userId={userId} candidates={s.candidates} iVoted={s.iVoted} />
      <p className="voting__turnout">
        {s.turnout.voted} of {s.turnout.members} members have voted ·{' '}
        {s.deadline ? `Voting closes ${closesAt.format(s.deadline)}` : 'Voting closes when everyone has voted'}
      </p>
      <p className="muted small voting__privacy">Nobody sees how anyone voted, and there are no running totals.</p>
      {s.canClose ? <CloseVoting meetupId={meetupId} /> : null}
    </section>
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
    return (
      <div className="card ballot">
        <p>Your vote is in. This browser can't change it, because the ballot was cast from another one.</p>
      </div>
    )
  }
  if (token && mine.isPending) return <p className="muted ballot-loading">Loading your ballot…</p>
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
  // Drag to reorder with a mouse; the arrows stay for touch and keyboards.
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const drop = (targetId: string) => {
    if (dragging && dragging !== targetId) {
      const next = ranking.filter((r) => r !== dragging)
      next.splice(ranking.indexOf(targetId), 0, dragging)
      update(next)
    }
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="card ballot">
      <div className="ballot__head">
        <div>
          <h3>Your ranking</h3>
          <p className="muted small">Top choice gets the most weight.</p>
        </div>
        <span className="pill">
          <GripVerticalIcon size={14} />
          Drag or use the arrows
        </span>
      </div>
      {ranking.length ? (
        <ol className="ranked">
          {ranking.map((id, i) => (
            <li
              key={id}
              className={`ranked__row${dragging === id ? ' is-dragging' : ''}${over === id && dragging !== id ? ' is-over' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', id)
                setDragging(id)
              }}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                setOver(id)
              }}
              onDragLeave={() => setOver((o) => (o === id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                drop(id)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
            >
              <span className="ranked__grip" aria-hidden="true">
                <GripVerticalIcon size={18} />
              </span>
              <span className="ranked__num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="ranked__pin" aria-hidden="true">
                <MapPinIcon size={16} />
              </span>
              <span className="ranked__name">{labels.get(id)}</span>
              <span className="ranked__tools">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${labels.get(id)} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUpIcon size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${labels.get(id)} down`}
                  disabled={i === ranking.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDownIcon size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Take ${labels.get(id)} off your ballot`}
                  onClick={() => update(ranking.filter((r) => r !== id))}
                >
                  <XIcon size={16} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Pick your first choice below.</p>
      )}
      {unranked.length ? (
        <div className="ballot__unranked">
          <p className="field-label">Not ranked yet</p>
          <div className="row wrap">
            {unranked.map((c) => (
              <button key={c.id} type="button" className="chip" onClick={() => update([...ranking, c.id])}>
                <PlusIcon size={14} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="info-box">
        <InfoIcon size={18} />
        Rank every place you'd be happy with, so your vote still counts if your first choice is out.
      </p>
      <div className="ballot__foot">
        <div>
          <strong>{saved && props.token ? 'Your vote is in' : 'Ready to submit?'}</strong>
          <p className="muted small">
            {saved && props.token
              ? 'You can change it until voting closes.'
              : 'You can change your vote until voting closes.'}
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={ranking.length === 0 || cast.isPending || saved}
          onClick={() => cast.mutate({ meetupId: props.meetupId, ranking, token: props.token ?? undefined })}
        >
          {cast.isPending ? 'Saving…' : props.token ? 'Change my vote' : 'Cast my vote'}
        </button>
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
