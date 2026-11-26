import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../server/routers/index.js'

type Status = inferRouterOutputs<AppRouter>['vote']['status']
type Result = NonNullable<Status['result']>
type Round = Result['rounds'][number]

export function Results({ result, turnout }: { result: Result; turnout: Status['turnout'] }) {
  const final = result.rounds.at(-1)

  return (
    <div className="card">
      <h2>{result.winner ? `The group picked ${result.winner.label}` : 'No winner'}</h2>
      <p className="muted small">
        {turnout.voted} of {turnout.members} voted.
      </p>
      {final ? <RoundView round={final} /> : <p className="muted">Nobody voted, so there was nothing to count.</p>}
      {result.rounds.length > 1 ? (
        <details className="count-steps">
          <summary>How the count went</summary>
          <ol>
            {result.rounds.map((round, i) => (
              <li key={i}>{explain(round)}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

function RoundView({ round }: { round: Round }) {
  const top = Math.max(1, ...round.tallies.map((t) => t.votes))
  return (
    <div className="stack">
      <ul className="plain tallies">
        {round.tallies.map((t) => (
          <li key={t.id}>
            <span className="row spread">
              <span>{t.label}</span>
              <span className="muted">{t.votes === 1 ? '1 vote' : `${t.votes} votes`}</span>
            </span>
            <span className="bar" style={{ width: `${(t.votes / top) * 100}%` }} />
          </li>
        ))}
      </ul>
      <p>{explain(round)}</p>
      {round.exhausted ? (
        <p className="muted small">
          {round.exhausted === 1 ? '1 ballot has' : `${round.exhausted} ballots have`} no places left to count.
        </p>
      ) : null}
    </div>
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
