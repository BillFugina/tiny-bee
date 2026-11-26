// Renders the public pages (home and /agents) into plain HTML after vite build,
// so agents and other fetchers that don't run JavaScript can read them. Runs as
// `npm run prerender`, which points tsx at the app's tsconfig for its JSX settings.
//
// dist/index.html becomes the prerendered home page, served at /. The empty app
// shell moves to dist/app.html, which vercel.json serves for every other route,
// so signed-in pages never show prerendered content. /agents gets dist/agents.html.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

interface Pages {
  renderHomePage: () => string
  renderAgentsPage: (origin: string) => string
}

const dist = new URL('../dist/', import.meta.url)
// A non-literal path keeps the server typecheck out of the React entry, which
// the app's own tsconfig checks.
const entry = fileURLToPath(new URL('../src/prerender.tsx', import.meta.url))
const { renderHomePage, renderAgentsPage } = (await import(entry)) as Pages

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'tiny-bee.billfugina.com'
const shell = await readFile(new URL('index.html', dist), 'utf8')
if (!shell.includes('<div id="root"></div>') || !shell.includes('<title>Tiny Bee</title>')) {
  throw new Error('dist/index.html did not have the expected title and root')
}

function page(title: string, description: string, body: string): string {
  return shell
    .replace(
      '<title>Tiny Bee</title>',
      `<title>${title}</title>\n    <meta name="description" content="${description}" />`,
    )
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

await writeFile(new URL('app.html', dist), shell)
await writeFile(
  new URL('index.html', dist),
  page(
    'Tiny Bee: plan a meetup everyone can actually make',
    'Tiny Bee finds the fairest place for a group to meet and runs the vote. Members can plan with their own AI agent over MCP.',
    renderHomePage(),
  ),
)
await writeFile(
  new URL('agents.html', dist),
  page(
    'Plan with your own AI agent · Tiny Bee',
    'Connect Claude, Codex or any MCP client to Tiny Bee, the group meetup planner.',
    renderAgentsPage(`https://${host}`),
  ),
)
console.log('Wrote dist/index.html, dist/agents.html and dist/app.html')
