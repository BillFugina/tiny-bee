# Tiny Bee

A group meetup planner where an agent talks with each member privately, finds
places that are fair for everyone, and runs the vote. Members can also take part
through their own agents over MCP.

This branch is the deployable skeleton: sign-in, a typed API, a database with
migrations, CI, and a preview deploy for every branch. The planner itself
(fairness engine, ranked-choice vote, the private agent, MCP) comes next.

## Stack

| Layer    | Choice                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Web      | Vite + React single-page app, React Router, TanStack Form                      |
| API      | tRPC (fetch adapter) as a Vercel function at `/api/trpc`                       |
| Auth     | Better Auth (email and password, magic link) at `/api/auth`                    |
| Database | Neon Postgres via Drizzle ORM (Neon HTTP driver on Vercel)                     |
| Hosting  | Vercel: static SPA on the CDN, API as functions, a preview per branch          |
| CI       | GitHub Actions: lint, format, typecheck, migrations, drift check, tests, build |

Later: Ably (realtime) and Inngest (durable workflows) behind adapters, and
Better Auth's MCP plugin as the OAuth server for members' agents.

## Layout

```
api/            Vercel functions (thin wrappers around server/handlers.ts)
server/         tRPC routers, Better Auth, Drizzle schema and client, env
shared/         zod schemas used by both the browser and the server
domain/         pure logic with no I/O: the fairness engine and the instant-runoff count
src/            React app
drizzle/        generated SQL migrations (commit these)
scripts/        dev API server, migration runner and town list builder (TypeScript, run with tsx)
tests/          Vitest, with fast-check property tests for the domain logic
```

## Run it locally

Needs Node 22+ and a Postgres database (a local one, or a Neon branch).

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:migrate
npm run dev               # web on http://localhost:5173, API on :3001
```

`npm run dev` runs Vite and a small Node server that serves the same handlers
the Vercel functions use, so local behaves like a deploy. Magic links are
written to the API's log until an email provider is added.

## Changing the database

1. Edit `server/db/schema.ts`.
2. `npm run db:generate` to write a migration into `drizzle/`.
3. `npm run db:migrate` to apply it, and commit both.

CI fails if the schema and the migrations disagree.

## Deploying on Vercel

1. Import this repo as a new Vercel project (framework: Vite; `vercel.json`
   sets the build command and routes). When Vercel's GitHub app asks for repo
   access, choose only this repository.
2. Connect Neon. With an existing Neon account, start from the Neon console
   (Integrations > Vercel) so the database stays in that account, and turn on a
   database branch for each preview deployment. It sets `DATABASE_URL` per
   environment. Moving the app to another Vercel account later only means
   reconnecting this integration; the data stays put.
3. Add `BETTER_AUTH_SECRET` for Production and Preview (generate with the
   command in `.env.example`).
4. Push a branch: Vercel builds a preview, the build migrates that preview's
   Neon branch (`npm run vercel-build`), and the PR gets a link.

## Scripts

| Script                            | What it does                                           |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Vite plus the local API server                         |
| `npm run build`                   | Typecheck and build the SPA                            |
| `npm test`                        | Vitest (database tests run when `DATABASE_URL` is set) |
| `npm run lint` / `npm run format` | ESLint / Prettier                                      |
| `npm run db:generate`             | New migration from the schema                          |
| `npm run db:migrate`              | Apply migrations to `DATABASE_URL`                     |
| `npm run db:studio`               | Drizzle Studio                                         |

## Town data

Members pick their starting town from `server/places/towns.json`, a trimmed
extract of [GeoNames](https://www.geonames.org/) (the `cities1000` set, via the
[`all-the-cities`](https://github.com/zeke/all-the-cities) package). It keeps
every US town the set has, plus places elsewhere with at least 15,000 people.
`npm run towns:build` regenerates it.

GeoNames data is licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), so the app credits
GeoNames in its footer. Keep that credit if you reuse the data.
