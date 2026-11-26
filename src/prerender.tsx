import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AgentsPage } from './pages/AgentsPage'

/**
 * Renders the /agents page to static HTML at build time, so agents and other
 * fetchers that don't run JavaScript can read it. The app replaces it on load.
 */
export function renderAgentsPage(origin: string): string {
  return renderToString(
    <MemoryRouter initialEntries={['/agents']}>
      <div className="shell">
        <header>
          <a href="/" className="brand">
            Tiny Bee
          </a>
          <nav>
            <a href="/sign-in">Sign in</a>
          </nav>
        </header>
        <main>
          <AgentsPage origin={origin} />
        </main>
      </div>
    </MemoryRouter>,
  )
}
