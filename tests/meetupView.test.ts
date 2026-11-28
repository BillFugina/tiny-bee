import { describe, expect, it } from 'vitest'
import { currentStep, defaultStep, nextStep, planSteps, previousStep, stepOpen } from '../src/lib/meetupView.js'

const organizer = { isOrganizer: true, meReady: false, ready: 0 }
const member = { isOrganizer: false, meReady: false, ready: 0 }

describe('meetup steps', () => {
  it('gives the organizer an invite step and other members none', () => {
    expect(planSteps(true)).toEqual(['start', 'invite', 'towns'])
    expect(planSteps(false)).toEqual(['start', 'towns'])
  })

  it('starts everyone in the planner until they have a start', () => {
    expect(defaultStep(organizer)).toBe('start')
    expect(defaultStep({ ...member, ready: 3 })).toBe('start')
  })

  it('sends an organizer who is alone to the invite step, not the empty towns page', () => {
    const alone = { ...organizer, meReady: true, ready: 1 }
    expect(defaultStep(alone)).toBe('invite')
    expect(stepOpen('towns', alone)).toBe(false)
    expect(currentStep('towns', alone)).toBe('invite')
  })

  it('opens the towns once two members have a start', () => {
    const two = { ...organizer, meReady: true, ready: 2 }
    expect(stepOpen('towns', two)).toBe(true)
    expect(defaultStep(two)).toBe('towns')
  })

  it('keeps the step a visit asked for while it is open', () => {
    expect(currentStep('start', { ...organizer, meReady: true, ready: 2 })).toBe('start')
    expect(currentStep('invite', { ...organizer, meReady: true, ready: 2 })).toBe('invite')
  })

  it('never shows the invite step to a member who is not the organizer', () => {
    expect(stepOpen('invite', { ...member, meReady: true, ready: 2 })).toBe(false)
    expect(currentStep('invite', { ...member, meReady: true, ready: 2 })).toBe('towns')
    expect(currentStep('nonsense', member)).toBe('start')
  })

  it('goes back and forward one step at a time', () => {
    expect(previousStep('towns', true)).toBe('invite')
    expect(previousStep('invite', true)).toBe('start')
    expect(previousStep('start', true)).toBeNull()
    expect(previousStep('towns', false)).toBe('start')
    expect(nextStep('start', true)).toBe('invite')
    expect(nextStep('start', false)).toBe('towns')
    expect(nextStep('towns', true)).toBeNull()
  })
})
