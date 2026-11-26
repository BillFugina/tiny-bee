// Writes dist/agents.html: the /agents page rendered to plain HTML, so agents
// and other fetchers that don't run JavaScript can read it. Runs after vite build
// as `npm run prerender`, which points tsx at the app's tsconfig for its JSX settings.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dist = new URL('../dist/', import.meta.url)
// A non-literal path keeps the server typecheck out of the React entry, which
// the app's own tsconfig checks.
const entry = fileURLToPath(new URL('../src/prerender.tsx', import.meta.url))
const { renderAgentsPage } = (await import(entry)) as { renderAgentsPage: (origin: string) => string }

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'tiny-bee.billfugina.com'
const html = await readFile(new URL('index.html', dist), 'utf8')
const page = html
  .replace(
    '<title>Tiny Bee</title>',
    '<title>Plan with your own AI agent · Tiny Bee</title>\n    <meta name="description" content="Connect Claude, Codex or any MCP client to Tiny Bee, the group meetup planner." />',
  )
  .replace('<div id="root"></div>', `<div id="root">${renderAgentsPage(`https://${host}`)}</div>`)
if (page === html) throw new Error('index.html did not have the expected title and root')
await writeFile(new URL('agents.html', dist), page)
console.log('Wrote dist/agents.html')
