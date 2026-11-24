/**
 * Local stand-in for Vercel functions: serves /api/trpc/* and /api/auth/* on
 * port 3001 with the same handlers the api/ functions use. Vite proxies /api
 * here (see vite.config.ts). Run with `npm run dev`.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { handleAuth, handleTrpc } from '../server/handlers.js'

const PORT = Number(process.env.API_PORT ?? 3001)

function toRequest(req: IncomingMessage): Request {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? `localhost:${PORT}`
  const url = new URL(req.url ?? '/', `http://${String(host)}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else if (value !== undefined) headers.set(key, value)
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by Node's fetch when streaming a request body.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

createServer(async (req, res) => {
  try {
    const request = toRequest(req)
    const path = new URL(request.url).pathname
    const handler = path.startsWith('/api/trpc') ? handleTrpc : path.startsWith('/api/auth') ? handleAuth : null
    const response = handler ? await handler(request) : new Response('Not found', { status: 404 })
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) res.setHeader('set-cookie', cookies)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end('Internal error')
  }
}).listen(PORT, () => {
  console.info(`[api] listening on http://localhost:${PORT}`)
})
