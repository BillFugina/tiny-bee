import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../server/routers/index.js'
import type { PlanStepTarget } from '../../../shared/schemas'
import { SparklesIcon } from '../../components/icons'
import { CheckIn } from './CheckIn'
import { StartForm } from './StartForm'

type Member = inferRouterOutputs<AppRouter>['meetups']['get']['members'][number]

/** The member's private planner: the chat, then their starting point and drive limit. */
export function Planner({
  meetupId,
  me,
  kicker,
  onOffer,
}: {
  meetupId: string
  me: Member
  /** Like "Step 1 of 3"; defaults to "Your planner". */
  kicker?: string
  /** Opens the step the planner offered a button for. */
  onOffer: (step: PlanStepTarget) => void
}) {
  return (
    <section className="planner" aria-labelledby="planner-title">
      <header className="planner__head">
        <span className="planner__mark" aria-hidden="true">
          <SparklesIcon size={22} />
        </span>
        <p className="kicker">{kicker ?? 'Your planner'}</p>
        <h2 id="planner-title" className="view-title">
          Let's find your middle ground.
        </h2>
        <p className="view-lead">I'll help the group choose a place that feels easy for everyone to reach.</p>
      </header>
      <CheckIn meetupId={meetupId} onOffer={onOffer} />
      <StartForm
        key={`${me.start?.townId ?? 0}-${me.maxMinutes ?? 0}`}
        meetupId={meetupId}
        start={me.start}
        maxMinutes={me.maxMinutes}
      />
      <p className="planner__foot">
        <span className="planner__dot" aria-hidden="true" />
        Only you see this chat. Other members see just your starting town.
      </p>
    </section>
  )
}
