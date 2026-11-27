import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { MapBackground } from './components/MapBackground'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { AgentsPage } from './pages/AgentsPage'
import { SignedOutHome } from './pages/HomePage'

/**
 * Renders the public pages to static HTML at build time, so agents and other
 * fetchers that don't run JavaScript can read them. The app replaces them on load.
 */
function renderPage(path: string, page: ReactNode): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <div className="shell">
        <MapBackground />
        <SiteHeader
          brand={(content) => (
            <a href="/" className="brand" aria-label="Tiny Bee home">
              {content}
            </a>
          )}
        >
          <a href="/sign-in" className="pill-button">
            Sign in
          </a>
        </SiteHeader>
        <main className="page">{page}</main>
        <SiteFooter />
      </div>
    </MemoryRouter>,
  )
}

export function renderHomePage(): string {
  return renderPage('/', <SignedOutHome />)
}

export function renderAgentsPage(origin: string): string {
  return renderPage('/agents', <AgentsPage origin={origin} />)
}
