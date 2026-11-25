import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { formatMinutes } from '../../lib/format'
import { useTRPC } from '../../lib/trpc'
import { AddToShortlist } from './AddToShortlist'

const WEIGHTS = [
  { value: 0, label: 'Shortest longest drive' },
  { value: 0.25, label: '' },
  { value: 0.5, label: 'Balanced' },
  { value: 0.75, label: '' },
  { value: 1, label: 'Least driving overall' },
]

export function FairAreas({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const [step, setStep] = useState(0)
  const averageWeight = WEIGHTS[step]!.value
  const fair = useQuery(
    trpc.meetups.fairAreas.queryOptions({ meetupId, averageWeight }, { placeholderData: keepPreviousData }),
  )
  const shortlist = useQuery(trpc.shortlist.list.queryOptions({ meetupId }))
  const listed = new Set(shortlist.data?.items.map((i) => String(i.townId)))
  const canAdd = (area: Area) =>
    shortlist.data?.phase === 'planning' &&
    !area.isMidpoint &&
    !listed.has(area.id) &&
    shortlist.data.items.length < shortlist.data.max
  const item = (area: Area) => (
    <AreaItem
      key={area.id}
      area={area}
      action={canAdd(area) ? <AddToShortlist meetupId={meetupId} townId={Number(area.id)} /> : null}
      listed={listed.has(area.id)}
    />
  )

  return (
    <div className="card">
      <h2>Fairest places to meet</h2>
      {fair.isPending ? (
        <p className="muted">Working it out…</p>
      ) : !fair.data ? (
        <p className="error">{fair.error?.message ?? 'Could not load the fair areas.'}</p>
      ) : fair.data.ready < 2 ? (
        <p className="muted">
          This needs at least two starting points.
          {fair.data.waitingOn.length ? ` Still waiting on: ${fair.data.waitingOn.join(', ')}.` : ''}
        </p>
      ) : (
        <>
          <label>
            Favor
            <input
              type="range"
              min={0}
              max={WEIGHTS.length - 1}
              step={1}
              value={step}
              onChange={(e) => setStep(e.target.valueAsNumber)}
            />
            <span className="scale muted">
              <span>{WEIGHTS[0]!.label}</span>
              <span>{WEIGHTS[WEIGHTS.length - 1]!.label}</span>
            </span>
          </label>
          {fair.data.areas.length ? (
            <ol className="areas">{fair.data.areas.map(item)}</ol>
          ) : (
            <>
              <p>Nowhere fits everyone's drive limit. These come closest:</p>
              <ol className="areas">{fair.data.closestMisses.map(item)}</ol>
            </>
          )}
          {fair.data.waitingOn.length ? (
            <p className="muted">Not counted yet: {fair.data.waitingOn.join(', ')}.</p>
          ) : null}
          <p className="muted small">
            Drive times are rough estimates from distance. Real road times come once a maps service is added.
          </p>
        </>
      )}
    </div>
  )
}

type Area = {
  id: string
  name: string
  isMidpoint: boolean
  longest: number
  average: number
  times: { name: string; isMe: boolean; minutes: number; maxMinutes: number }[]
}

function AreaItem({ area, action, listed }: { area: Area; action: ReactNode; listed: boolean }) {
  return (
    <li>
      <strong>{area.isMidpoint ? 'The halfway point (no town nearby)' : area.name}</strong>
      {listed ? <span className="muted small"> · on the shortlist</span> : null}
      <span className="muted">
        {' '}
        · longest {formatMinutes(area.longest)}, average {formatMinutes(area.average)}
      </span>
      <ul className="times">
        {area.times.map((t) => (
          <li key={t.name} className={t.minutes > t.maxMinutes ? 'error' : undefined}>
            {t.isMe ? 'You' : t.name}: {formatMinutes(t.minutes)}
            {t.minutes > t.maxMinutes ? ` (over ${formatMinutes(t.maxMinutes)})` : ''}
          </li>
        ))}
      </ul>
      {action}
    </li>
  )
}
