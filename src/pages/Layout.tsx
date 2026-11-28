import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import { MapBackground } from '../components/MapBackground'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { LogOutIcon, UserIcon } from '../components/icons'
import { ActiveMeetupContext } from '../lib/activeMeetup'
import { authClient } from '../lib/auth-client'

export function Layout() {
  const { data: session } = authClient.useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeMeetup, setActiveMeetup] = useState<string | null>(null)

  async function signOut() {
    await authClient.signOut()
    await queryClient.invalidateQueries()
    await navigate('/')
  }

  return (
    <div className="shell">
      <MapBackground />
      <SiteHeader
        activeMeetup={activeMeetup}
        brand={(content) => (
          <Link to="/" className="brand" aria-label="Tiny Bee home">
            {content}
          </Link>
        )}
      >
        {session ? (
          <>
            <span className="profile-pill" title={session.user.email}>
              <span className="profile-pill__avatar" aria-hidden="true">
                <UserIcon size={17} />
              </span>
              <span className="profile-pill__name">{session.user.name || session.user.email}</span>
            </span>
            <button type="button" className="theme-toggle" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOutIcon size={19} />
            </button>
          </>
        ) : (
          <Link to="/sign-in" className="pill-button">
            Sign in
          </Link>
        )}
      </SiteHeader>
      <main className="page">
        <ActiveMeetupContext.Provider value={setActiveMeetup}>
          <Outlet />
        </ActiveMeetupContext.Provider>
      </main>
      <SiteFooter />
    </div>
  )
}
