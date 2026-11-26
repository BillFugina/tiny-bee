import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
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
        <header>
          <a href="/" className="brand">
            Tiny Bee
          </a>
          <nav>
            <a href="/sign-in">Sign in</a>
          </nav>
        </header>
        <main>{page}</main>
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
