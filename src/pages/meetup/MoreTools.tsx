import type { ReactNode } from 'react'
import { FairAreas } from './FairAreas'

/** Earlier steps, folded away once voting starts. */
export function MoreTools({ planner, meetupId }: { planner: ReactNode; meetupId: string }) {
  return (
    <div className="more-tools">
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
