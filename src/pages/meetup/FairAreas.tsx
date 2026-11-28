import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { CheckIcon, CompassIcon } from '../../components/icons'
import { useTRPC } from '../../lib/trpc'
import { AddToShortlist } from './AddToShortlist'
import { TownCard, type Area } from './TownCard'

const WEIGHTS = [0, 0.25, 0.5, 0.75, 1]
const MIDDLE = [
  'Balanced for fairness',
  'Balanced for fairness',
  'Perfectly balanced',
  'Optimized for the group',
  'Optimized for the group',
]

function middleLabel(step: number) {
  return MIDDLE[step] ?? MIDDLE[0]!
}

/** The fairest towns for everyone's starting points, with the Favor slider. */
export function FairAreas({ meetupId, aside }: { meetupId: string; aside?: ReactNode }) {
  const trpc = useTRPC()
  const [step, setStep] = useState(0)
  const averageWeight = WEIGHTS[step]!
  const fair = useQuery(
    trpc.meetups.fairAreas.queryOptions({ meetupId, averageWeight }, { placeholderData: keepPreviousData }),
  )
  const shortlist = useQuery(trpc.shortlist.list.queryOptions({ meetupId }))
  const listed = new Set(shortlist.data?.items.map((i) => String(i.townId)))
  const planning = shortlist.data?.phase === 'planning'
  const full = !!shortlist.data && shortlist.data.items.length >= shortlist.data.max

  const action = (area: Area) => {
    if (!planning) return null
    if (listed.has(area.id)) {
      return (
        <span className="town-card__added">
          <CheckIcon size={16} />
          On the shortlist
        </span>
      )
    }
    if (area.isMidpoint) return null
    if (full) return <span className="muted small">The shortlist is full.</span>
    return <AddToShortlist meetupId={meetupId} townId={Number(area.id)} />
  }
  const card = (area: Area) => (
    <li key={area.id}>
      <TownCard area={area} listed={listed.has(area.id)} action={action(area)} />
    </li>
  )

  let list: ReactNode
  if (fair.isPending) {
    list = <p className="muted">Working it out…</p>
  } else if (!fair.data) {
    list = <p className="error">{fair.error?.message ?? 'Could not load the fair areas.'}</p>
  } else if (fair.data.ready < 2) {
    list = (
      <div className="empty-card">
        <p>
          <strong>The fairest towns show up here.</strong>
        </p>
        <p className="muted">
          This needs at least two starting points.
          {fair.data.waitingOn.length ? ` Still waiting on: ${fair.data.waitingOn.join(', ')}.` : ''}
        </p>
      </div>
    )
  } else {
    list = (
      <>
        {fair.data.areas.length ? (
          <ol className="town-list">{fair.data.areas.map(card)}</ol>
        ) : (
          <>
            <p>Nowhere fits everyone's drive limit. These come closest:</p>
            <ol className="town-list">{fair.data.closestMisses.map(card)}</ol>
          </>
        )}
        {fair.data.waitingOn.length ? (
          <p className="muted small">Not counted yet: {fair.data.waitingOn.join(', ')}.</p>
        ) : null}
        <p className="muted small">
          Drive times are rough estimates from distance. Real road times come once a maps service is added.
        </p>
      </>
    )
  }

  const ready = fair.data?.ready ?? 0
  return (
    <div className="fair">
      {ready >= 2 ? (
        <section className="card favor" aria-labelledby="favor-title">
          <div className="favor__head">
            <span className="favor__icon" aria-hidden="true">
              <CompassIcon size={20} />
            </span>
            <div>
              <h3 id="favor-title">Favor</h3>
              <p className="muted small">Tune the recommendations to your group's priorities.</p>
            </div>
          </div>
          <div className="favor__scale favor__scale--top" aria-hidden="true">
            <span>Shortest longest drive</span>
            <span>Least driving overall</span>
          </div>
          <input
            type="range"
            aria-labelledby="favor-title"
            aria-valuetext={middleLabel(step)}
            min={0}
            max={WEIGHTS.length - 1}
            step={1}
            value={step}
            onChange={(e) => setStep(e.target.valueAsNumber)}
          />
          <div className="favor__scale" aria-hidden="true">
            <span>Equal journeys</span>
            <strong>{middleLabel(step)}</strong>
            <span>Fastest total</span>
          </div>
        </section>
      ) : null}
      <div className={aside ? 'fair__grid' : undefined}>
        <section className="fair__list" aria-labelledby="fair-title">
          <div className="section-head">
            <div>
              <p className="kicker">
                {ready >= 2 ? `Based on ${ready} starting points` : 'Waiting on starting points'}
              </p>
              <h3 id="fair-title" className="section-title">
                Fairest towns
              </h3>
            </div>
          </div>
          {list}
        </section>
        {aside}
      </div>
    </div>
  )
}
