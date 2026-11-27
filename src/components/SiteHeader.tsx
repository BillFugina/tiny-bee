import type { ReactNode } from 'react'
import { toggleTheme, useTheme } from '../lib/theme'
import { LogoIcon, MoonIcon, SunIcon } from './icons'

/**
 * The bar across the top of every page: the brand, the theme switch and the
 * page's own links (sign in, or the member's email and sign out). Shared by the
 * app and the prerendered pages, so `brand` is a link element the caller makes.
 */
export function SiteHeader({ brand, children }: { brand: (content: ReactNode) => ReactNode; children: ReactNode }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        {brand(
          <>
            <span className="brand__mark" aria-hidden="true">
              <LogoIcon size={20} />
            </span>
            <span className="brand__name">
              Tiny Bee<span className="brand__dot">.</span>
            </span>
          </>,
        )}
        <nav className="site-header__nav">
          <ThemeToggle />
          <span className="site-header__divider" aria-hidden="true" />
          {children}
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
      {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  )
}
