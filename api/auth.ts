import { handleAuth } from '../server/handlers.js'

// vercel.json rewrites /api/auth/* here; request.url keeps the original path.
export const GET = handleAuth
export const POST = handleAuth
