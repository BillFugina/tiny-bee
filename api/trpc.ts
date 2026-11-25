import { handleTrpc } from '../server/handlers.js'

// vercel.json rewrites /api/trpc/* here; request.url keeps the original path.
export const GET = handleTrpc
export const POST = handleTrpc
