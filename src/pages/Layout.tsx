import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from 'react-router'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { authClient } from '../lib/auth-client'

export function Layout() {
  const { data: session } = authClient.useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function signOut() {
    await authClient.signOut()
    await queryClient.invalidateQueries()
    await navigate('/')
  }

  return (
    <div className="shell">
      <SiteHeader
        brand={(content) => (
          <Link to="/" className="brand" aria-label="Tiny Bee home">
            {content}
          </Link>
        )}
      >
        {session ? (
          <>
            <span className="muted small site-header__email">{session.user.email}</span>
            <button type="button" className="pill-button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/sign-in" className="pill-button">
            Sign in
          </Link>
        )}
      </SiteHeader>
      <main className="page">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
