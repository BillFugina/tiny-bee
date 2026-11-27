import { useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import type { AppRouter } from '../../../server/routers/index.js'
import { CrownIcon, MapPinIcon, TrophyIcon } from '../../components/icons'
import { useTRPC } from '../../lib/trpc'
import { TownCard } from './TownCard'

type Status = inferRouterOutputs<AppRouter>['vote']['status']
type Result = NonNullable<Status['result']>
type Round = Result['rounds'][number]

/** The decided screen: the winner, why it won, and the round-by-round count. */
export function Results({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const status = useQuery(trpc.vote.status.queryOptions({ meetupId }))
  const shortlist = useQuery(trpc.shortlist.list.queryOptions({ meetupId }))
  const fair = useQuery(trpc.meetups.fairAreas.queryOptions({ meetupId, averageWeight: 0 }))

  if (!status.data) return status.error ? <p className="error">{status.error.message}</p> : null
  const { result, turnout } = status.data
  if (!result) return null

  const final = result.rounds.at(-1)
  const winnerTown = result.winner
    ? shortlist.data?.items.find((item) => item.id === result.winner!.id)?.townId
    : undefined
  const areas = fair.data ? [...fair.data.areas, ...fair.data.closestMisses] : []
  const winnerArea = winnerTown === undefined ? undefined : areas.find((a) => a.id === String(winnerTown))

  return (
    <div className="results">
      <div className="results__grid">
        <section className="results__hero" aria-labelledby="results-title">
          <p className="kicker kicker--line">Final results</p>
          <p className="results__rounds">
            <span className="results__trophy" aria-hidden="true">
              <TrophyIcon size={20} />
            </span>
            {result.rounds.length === 1
              ? 'After one round of ranked-choice voting'
              : `After ${result.rounds.length} rounds of ranked-choice voting`}
          </p>
          <h2 id="results-title" className="results__title">
            {result.winner ? (
              <>
                The group picked <span className="results__winner">{result.winner.label}!</span>
              </>
            ) : (
              'No winner this time'
            )}
          </h2>
          {final ? (
            <div className="results__why">
              <p className="field-label">Why it won</p>
              <p>{explain(final)}</p>
            </div>
          ) : (
            <p className="muted">Nobody voted, so there was nothing to count.</p>
          )}
          <dl className="stats">
            <div>
              <dt>Members voting</dt>
              <dd>
                {turnout.voted} of {turnout.members}
              </dd>
            </div>
            <div>
              <dt>Winning round</dt>
              <dd>{final ? `Round ${final.number}` : '–'}</dd>
            </div>
            <div>
              <dt>Places on the ballot</dt>
              <dd>{shortlist.data ? shortlist.data.items.length : '–'}</dd>
            </div>
          </dl>
        </section>
        {result.winner ? (
          <section className="results__spot" aria-labelledby="spot-title">
            <div className="results__spot-head">
              <h3 id="spot-title">
                <CrownIcon size={18} />
                Your meetup spot
              </h3>
              <span className="pill pill--accent">Selected</span>
            </div>
            {winnerArea ? (
              <TownCard area={winnerArea} title={result.winner.label} />
            ) : (
              <article className="town-card">
                <header className="town-card__head">
                  <span className="town-card__pin" aria-hidden="true">
                    <MapPinIcon size={20} />
                  </span>
                  <h3 className="town-card__name">{result.winner.label}</h3>
                </header>
              </article>
            )}
          </section>
        ) : null}
      </div>
      {final ? <Breakdown result={result} /> : null}
    </div>
  )
}

function Breakdown({ result }: { result: Result }) {
  const [open, setOpen] = useState(false)
  const rows = new Map<string, { label: string; votes: number; note: string }>()
  for (const round of result.rounds) {
    for (const t of round.tallies) {
      const note =
        round.winner === t.label
          ? `Winner · round ${round.number}`
          : round.eliminated === t.label
            ? `Out in round ${round.number}`
            : 'Final round'
      rows.set(t.id, { label: t.label, votes: t.votes, note })
    }
  }
  const list = [...rows.values()].sort((a, b) => b.votes - a.votes)
  const top = Math.max(1, ...list.map((r) => r.votes))
  return (
    <section className="card breakdown" aria-labelledby="breakdown-title">
      <div className="breakdown__head">
        <div>
          <p className="kicker">Ranked-choice results</p>
          <h3 id="breakdown-title" className="section-title">
            Vote breakdown
          </h3>
          <p className="muted small">Each place's votes in the last round it was counted.</p>
        </div>
        {result.rounds.length > 1 ? (
          <button type="button" className="ghost-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide round detail' : 'View round detail'}
          </button>
        ) : null}
      </div>
      <ul className="bars">
        {list.map((r) => (
          <li key={r.label} className={r.note.startsWith('Winner') ? 'bars__row bars__row--win' : 'bars__row'}>
            <span className="bars__label">
              <strong>{r.label}</strong>
              <span className="muted small">{r.note}</span>
            </span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(r.votes / top) * 100}%` }} />
            </span>
            <span className="bars__votes">{r.votes === 1 ? '1 vote' : `${r.votes} votes`}</span>
          </li>
        ))}
      </ul>
      {open ? (
        <ol className="rounds">
          {result.rounds.map((round) => (
            <li key={round.number} className="round-card">
              <p className="field-label">Round {round.number}</p>
              <p>{explain(round)}</p>
              {round.exhausted ? (
                <p className="muted small">
                  {round.exhausted === 1 ? '1 ballot has' : `${round.exhausted} ballots have`} no places left to count.
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="muted small breakdown__foot">Ballots are counted without names.</p>
    </section>
  )
}

function explain(round: Round): string {
  switch (round.reason) {
    case 'majority':
      return `${round.winner} has more than half the votes, so it wins.`
    case 'last-standing':
      return `${round.winner} is the only place left, so it wins.`
    case 'fewest-votes':
      return `${round.eliminated} has the fewest votes, so it's out. Its ballots move to their next choice.`
    case 'tie-broken-by-earlier-round':
      return `A tie for fewest votes. ${round.eliminated} had fewer in round ${round.tieBrokenByRound}, so it's out.`
    case 'tie-broken-by-list-order':
      return `A tie for fewest votes that earlier rounds can't break. ${round.eliminated} was shortlisted last, so it's out.`
  }
}
