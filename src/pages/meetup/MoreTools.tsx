import type { ReactNode } from 'react'
import { FairAreas } from './FairAreas'
import { Shortlist } from './Shortlist'

/** Earlier steps, folded away once voting starts. */
export function MoreTools({ planner, meetupId }: { planner: ReactNode; meetupId: string }) {
  return (
    <div className="more-tools">
      <details className="more">
        <summary>The shortlist and its notes</summary>
        <div className="more__body">
          <Shortlist meetupId={meetupId} />
        </div>
      </details>
      {planner ? (
        <details className="more">
          <summary>Your planner and starting point</summary>
          <div className="more__body">{planner}</div>
        </details>
      ) : null}
      <details className="more">
        <summary>The fairest towns</summary>
        <div className="more__body">
          <FairAreas meetupId={meetupId} />
        </div>
      </details>
    </div>
  )
}
