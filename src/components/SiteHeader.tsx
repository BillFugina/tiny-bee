import type { ReactNode } from 'react'
import { toggleTheme, useTheme } from '../lib/theme'
import { LogoIcon, MoonIcon, SunIcon } from './icons'

/**
 * The bar across the top of every page: the brand, the open meetup's title
 * (on a meetup page), the theme switch and the page's own links. Shared by the
 * app and the prerendered pages, so `brand` is a link element the caller makes.
 */
export function SiteHeader(props: {
  brand: (content: ReactNode) => ReactNode
  activeMeetup?: string | null
  children: ReactNode
}) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        {props.brand(
          <>
            <span className="brand__mark" aria-hidden="true">
              <LogoIcon size={22} />
            </span>
            <span className="brand__name">Tiny Bee</span>
          </>,
        )}
        {props.activeMeetup ? (
          <p className="site-header__active">
            <span className="site-header__active-label">Active meetup</span>
            <span className="site-header__active-title">{props.activeMeetup}</span>
          </p>
        ) : null}
        <nav className="site-header__nav" aria-label="Account">
          <ThemeToggle />
          <span className="site-header__divider" aria-hidden="true" />
          {props.children}
        </nav>
      </div>
    </header>
  )
}

/** Switches between the light and dark themes. Starts on the device's setting. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  )
}
