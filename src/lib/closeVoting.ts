/** Choices for when voting closes: a few days as chips, then a time of day. */

export const CLOSE_HOURS = [9, 12, 18, 21] as const

const DAY = 24 * 60 * 60 * 1000

export interface DayOption {
  /** The local date, as YYYY-MM-DD. */
  key: string
  label: string
  detail: string
}

/** A date's local YYYY-MM-DD key. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The local moment a day's chosen hour starts. */
export function closeAt(key: string, hour: number): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!, hour, 0, 0, 0)
}

export function hourLabel(hour: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour))
}

/** Today and the next few days, skipping today once its last time has passed. */
export function dayOptions(now: Date, count = 6, locale?: string): DayOption[] {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' })
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const out: DayOption[] = []
  for (let i = 0; out.length < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const key = dayKey(d)
    if (!CLOSE_HOURS.some((h) => isOpen(key, h, now))) continue
    out.push({ key, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday.format(d), detail: monthDay.format(d) })
  }
  return out
}

/** A closing time has to be in the future and within the longest vote. */
export function isOpen(key: string, hour: number, now: Date, maxDays = Infinity): boolean {
  const t = closeAt(key, hour).getTime() - now.getTime()
  return t > 0 && t <= maxDays * DAY
}

/** The time a day gets when only the day was picked: the latest one still ahead. */
export function defaultHour(key: string, now: Date, maxDays = Infinity): number | null {
  return [...CLOSE_HOURS].reverse().find((h) => isOpen(key, h, now, maxDays)) ?? null
}

/**
 * The deadline from what was picked: a day and a time, a day alone (its latest
 * open time), a time alone (the soonest day it's still ahead), or nothing.
 */
export function chosenDeadline(
  pick: { day: string | null; hour: number | null },
  now: Date,
  maxDays = Infinity,
): Date | null {
  if (pick.day) {
    const hour = pick.hour ?? defaultHour(pick.day, now, maxDays)
    return hour === null ? null : closeAt(pick.day, hour)
  }
  if (pick.hour !== null) {
    const today = dayKey(now)
    if (isOpen(today, pick.hour, now, maxDays)) return closeAt(today, pick.hour)
    const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    return closeAt(tomorrow, pick.hour)
  }
  return null
}
