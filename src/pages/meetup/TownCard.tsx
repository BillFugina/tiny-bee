import type { ReactNode } from 'react'
import { CarIcon, CheckIcon, MapPinIcon } from '../../components/icons'
import { formatMinutes } from '../../lib/format'

export type Area = {
  id: string
  name: string
  isMidpoint: boolean
  longest: number
  average: number
  times: { name: string; isMe: boolean; minutes: number; maxMinutes: number }[]
}

/** One town with every member's drive to it. Used in the fairest list and on the result. */
export function TownCard(props: {
  area: Area
  title?: string
  listed?: boolean
  action?: ReactNode
  className?: string
}) {
  const { area } = props
  return (
    <article className={`town-card${props.listed ? ' town-card--listed' : ''} ${props.className ?? ''}`.trim()}>
      {props.listed ? (
        <span className="town-card__badge" aria-hidden="true">
          <CheckIcon size={14} />
        </span>
      ) : null}
      <header className="town-card__head">
        <span className="town-card__pin" aria-hidden="true">
          <MapPinIcon size={20} />
        </span>
        <div>
          <h3 className="town-card__name">
            {props.title ?? (area.isMidpoint ? 'The halfway point (no town nearby)' : area.name)}
          </h3>
          <p className="town-card__meta">
            <CarIcon size={14} />
            Longest {formatMinutes(area.longest)} • average {formatMinutes(area.average)}
          </p>
        </div>
      </header>
      <p className="town-card__label">Member drive times</p>
      <ul className="drive-chips">
        {area.times.map((t) => {
          const over = t.minutes > t.maxMinutes
          return (
            <li key={t.name} className={over ? 'drive-chip drive-chip--over' : 'drive-chip'}>
              <span className="drive-chip__name">{t.isMe ? 'You' : t.name}</span>
              <span className="drive-chip__time">
                {formatMinutes(t.minutes)}
                {over ? <span className="sr-only">, over {formatMinutes(t.maxMinutes)}</span> : null}
              </span>
              {over ? (
                <span className="drive-chip__over" aria-hidden="true">
                  over {formatMinutes(t.maxMinutes)}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {props.action ? <div className="town-card__action">{props.action}</div> : null}
    </article>
  )
}
