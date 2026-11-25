import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from 'react-router'
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
      <header>
        <Link to="/" className="brand">
          Tiny Bee
        </Link>
        <nav>
          {session ? (
            <>
              <span className="muted">{session.user.email}</span>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/sign-in">Sign in</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
