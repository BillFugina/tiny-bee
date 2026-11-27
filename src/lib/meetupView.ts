/**
 * Whether the meetup page shows the full-page planner (setup) rather than the
 * fairest-towns view. A member who opened the page before their start was set
 * stays in the planner after it saves one, so the chat isn't cut off mid
 * conversation; they move on when they choose to.
 */
export function showSetup(opts: {
  phase: 'planning' | 'voting' | 'decided'
  meReady: boolean
  lookAround: boolean
  beganInSetup: boolean
}): boolean {
  if (opts.phase !== 'planning' || opts.lookAround) return false
  return !opts.meReady || opts.beganInSetup
}
