/** The steps of the meetup page while the group plans. */
export type PlanStep = 'start' | 'invite' | 'towns'

export interface PlanContext {
  isOrganizer: boolean
  /** This member has a starting town and a drive limit. */
  meReady: boolean
  /** How many members have a starting town and a drive limit. */
  ready: number
}

export const STEP_LABEL: Record<PlanStep, string> = {
  start: 'Your planner',
  invite: 'Invite your group',
  towns: 'Fairest towns',
}

/** The organizer invites the group; other members go from their planner to the towns. */
export function planSteps(isOrganizer: boolean): PlanStep[] {
  return isOrganizer ? ['start', 'invite', 'towns'] : ['start', 'towns']
}

/** The fairest towns need two starting points; before that there's nothing to see there. */
export function stepOpen(step: PlanStep, ctx: PlanContext): boolean {
  if (!planSteps(ctx.isOrganizer).includes(step)) return false
  return step !== 'towns' || ctx.ready >= 2
}

/** Where a visit starts when it doesn't name a step. */
export function defaultStep(ctx: PlanContext): PlanStep {
  if (!ctx.meReady) return 'start'
  if (ctx.ready >= 2) return 'towns'
  return ctx.isOrganizer ? 'invite' : 'start'
}

/** The step to show: the one asked for when it's open, otherwise the default. */
export function currentStep(asked: string | null, ctx: PlanContext): PlanStep {
  const step = asked as PlanStep | null
  return step && stepOpen(step, ctx) ? step : defaultStep(ctx)
}

/** The step before this one, or null on the first. */
export function previousStep(step: PlanStep, isOrganizer: boolean): PlanStep | null {
  const steps = planSteps(isOrganizer)
  return steps[steps.indexOf(step) - 1] ?? null
}

/** The step after this one, or null on the last. */
export function nextStep(step: PlanStep, isOrganizer: boolean): PlanStep | null {
  const steps = planSteps(isOrganizer)
  const i = steps.indexOf(step)
  return i < 0 ? null : (steps[i + 1] ?? null)
}
