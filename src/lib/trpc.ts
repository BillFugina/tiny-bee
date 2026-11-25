import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { AppRouter } from '../../server/routers/index.js'

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()
