import { describe, expect, it } from 'vitest'
import { showSetup } from '../src/lib/meetupView.js'

const base = { phase: 'planning' as const, meReady: false, lookAround: false, beganInSetup: false }

describe('showSetup', () => {
  it('shows the planner while the member has no start yet', () => {
    expect(showSetup(base)).toBe(true)
  })

  it('keeps the planner open after the chat saves a start mid conversation', () => {
    expect(showSetup({ ...base, meReady: true, beganInSetup: true })).toBe(true)
  })

  it('goes to the fairest towns for a member who arrived ready', () => {
    expect(showSetup({ ...base, meReady: true })).toBe(false)
  })

  it('moves on when the member chooses to look around', () => {
    expect(showSetup({ ...base, meReady: true, beganInSetup: true, lookAround: true })).toBe(false)
    expect(showSetup({ ...base, lookAround: true })).toBe(false)
  })

  it('never shows setup once voting starts', () => {
    expect(showSetup({ ...base, phase: 'voting', beganInSetup: true })).toBe(false)
    expect(showSetup({ ...base, phase: 'decided' })).toBe(false)
  })
})
