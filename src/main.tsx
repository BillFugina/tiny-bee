import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import superjson from 'superjson'
import type { AppRouter } from '../server/routers/index.js'
import { TRPCProvider } from './lib/trpc'
import { AgentsPage } from './pages/AgentsPage'
import { ConsentPage } from './pages/ConsentPage'
import { Layout } from './pages/Layout'
import { HomePage } from './pages/HomePage'
import { MeetupPage } from './pages/MeetupPage'
import { SignInPage } from './pages/SignInPage'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/inter'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import './styles.css'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/consent', element: <ConsentPage /> },
      { path: '/agents', element: <AgentsPage /> },
      { path: '/m/:meetupId', element: <MeetupPage /> },
    ],
  },
])

function App() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }))
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
