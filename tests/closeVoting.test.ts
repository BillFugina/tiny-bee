import { describe, expect, it } from 'vitest'
import { chosenDeadline, closeAt, dayKey, dayOptions, defaultHour, isOpen } from '../src/lib/closeVoting.js'

// Friday Nov 27, 2026 at 7:00 PM local.
const now = new Date(2026, 10, 27, 19, 0)

describe('closing-time picker', () => {
  it('offers today first while one of its times is still ahead', () => {
    const days = dayOptions(now, 3, 'en-US')
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Sunday'])
    expect(days[0]).toMatchObject({ key: '2026-11-27', detail: 'Nov 27' })
  })

  it('skips today once its last time has passed', () => {
    const late = new Date(2026, 10, 27, 21, 30)
    expect(dayOptions(late, 2, 'en-US').map((d) => d.label)).toEqual(['Tomorrow', 'Sunday'])
  })

  it('treats past times and times beyond the longest vote as closed', () => {
    expect(isOpen('2026-11-27', 18, now)).toBe(false)
    expect(isOpen('2026-11-27', 21, now)).toBe(true)
    expect(isOpen('2027-01-30', 9, now, 30)).toBe(false)
  })

  it('gives a day picked alone its latest open time', () => {
    expect(defaultHour('2026-11-27', now)).toBe(21)
    expect(chosenDeadline({ day: '2026-11-28', hour: null }, now)).toEqual(closeAt('2026-11-28', 21))
  })

  it('puts a time picked alone on the soonest day it is still ahead', () => {
    expect(chosenDeadline({ day: null, hour: 21 }, now)).toEqual(closeAt('2026-11-27', 21))
    expect(chosenDeadline({ day: null, hour: 9 }, now)).toEqual(closeAt('2026-11-28', 9))
  })

  it('leaves the deadline empty when nothing is picked', () => {
    expect(chosenDeadline({ day: null, hour: null }, now)).toBeNull()
  })

  it('round-trips a local date key', () => {
    expect(dayKey(closeAt('2026-12-01', 12))).toBe('2026-12-01')
  })
})
