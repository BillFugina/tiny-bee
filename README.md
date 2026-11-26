# Tiny Bee

A group meetup planner where an agent talks with each member privately, finds
places that are fair for everyone, and runs the vote. Members can also take part
through their own agents over MCP.

Live at https://tiny-bee.billfugina.com. See [Features](#features) for what
works today and what's planned.

## Features

### Live

- **Sign-in:** email and password, or a sign-in link by email.
- **Meetups:** create one, share its invite link, or email invites from the
  meetup page and see who was invited and who joined.
- **Private check-in:** each member chats with a planner agent (Claude) that
  saves their starting town, longest drive and private needs, like a budget or a
  time they must leave. Other members see only a town.
- **Fair areas:** towns ranked by the longest single drive, with a slider that
  blends in the group's average drive, and every member's time shown.
- **Shortlist:** members add towns from the ranked list, with notes.
- **Vote:** anonymous ranked-choice (instant-runoff) with an optional deadline.
  Members see turnout, not choices, and everyone sees the result when it closes.
- **Bring your own agent:** an MCP server with OAuth, so a member's own agent
  (Claude, Codex or any MCP client) can join, check in, add to the shortlist and
  vote once the member confirms. See [Connecting your own agent](#connecting-your-own-agent).
- **Live updates:** open meetup pages refresh when anyone makes a change.
- **Readable by agents:** the home page and /agents are served as plain HTML,
  with `robots.txt` and `llms.txt`.

### Planned

From the MVP scope, not built yet:

- **Real driving times:** a route-matrix call for the finalists. Times today are
  estimates from straight-line distance.
- **Venues:** search for real venues in the top areas and shortlist those, not
  just towns.
- **Decision output:** a calendar invite (.ics) with each member's directions.
- **Map:** each member's reachable area drawn on a map.
- **Agent safeguards:** an audit log of tool calls and scripted evals, including
  leak tests, in CI.

Later:

- Transit, then flights, for groups spread far apart.
- Per-person fairness weights and travel cost.
- Picking the date too, and comparing voting methods on the same ballots.
- Reminders and rescheduling, and members' agents negotiating with each other.
- Phone sign-in, push notifications and a mobile app.

Wish list:

- **Location and ETA on the day:** members can choose, per meetup, to share
  their exact location on a map or only their ETA. Sharing is off by default,
  keeps only the latest position and stops on its own after the meetup. ETAs
  come from the same routing service as real driving times, counted to the venue
  (or the town's center until venues ship), and positions go out over the live
  updates channel.
- **Mobile app for background location:** the web app can share location only
  while it's open on the phone, so sharing in the background needs a native app.
- **Fairness over time:** for groups that meet often, whoever drove farthest last
  time gets a shorter drive next time.
- **Carpools:** pair up members whose routes overlap and suggest a pickup point.
- **Leave-by times:** use traffic at the meetup hour to tell each member when to
  set off.
- **Venue filters:** dog-friendly, kid-friendly, accessible or quiet, drawn from
  members' check-ins.
- **Repeat a meetup:** start the next one with the same group and settings in one
  tap.

## How it works

### Connecting your own agent

Add `https://tiny-bee.billfugina.com/api/mcp` as a remote MCP server in your
agent ([step-by-step for Claude, Claude Code and Codex](https://tiny-bee.billfugina.com/agents)). It registers itself, sends you to tiny-bee to sign in, and asks you to
allow it. After that it acts as you, and only you, in meetups you're in: list
and create meetups, join by invite link, set your start and private notes, look
at fair areas and the shortlist, add places, and vote. It casts a ballot only
with `memberConfirmed: true`, which the tool tells it to send only after you've
approved that exact ranking.

Under the hood: Better Auth's MCP plugin is the OAuth 2.1 server (dynamic
client registration, PKCE, tokens bound to `/api/mcp` with the `meetups`
scope), and `/api/mcp` is a stateless Streamable HTTP endpoint built on the
official MCP TypeScript SDK. Discovery lives at
`/.well-known/oauth-protected-resource/api/mcp`. Agents that receive their code
on a local port (`http://localhost:PORT/callback`) are allowed; any other plain
http redirect is refused. Changing `BETTER_AUTH_SECRET` makes the stored token
signing key unreadable, so clear the `jwks` table if you ever rotate it.

The public pages (home and /agents) are also rendered to plain HTML at build
time (`npm run prerender`), so agents and fetchers that don't run JavaScript can
read them. The prerendered home page becomes `dist/index.html`, and the empty app
shell moves to `dist/app.html`, which `vercel.json` serves for every other route.
`public/robots.txt` and `public/llms.txt` point agents at these pages.

### How the check-in stays private

Each member's chat and notes are stored under that member and only ever read
for them. The planner's tools act as that one member in that one meetup: no
tool input can name another member or meetup. Other members reach the planner
by name and starting town only (their drive limits and notes never do), and it
has no ballot tools at all. It adds to the shortlist only when the member asks.
Without an `ANTHROPIC_API_KEY` the chat shows as switched off and the rest of
the app works as before.

### How pages stay current

When a member joins, sets their start, changes the shortlist or votes, from
the app or through their own agent, the server publishes a bare `changed`
message to that meetup's Ably channel (`meetup:<id>`). Each open meetup page
listens with a short-lived token that can only subscribe to that one channel,
which the server hands out to members only, and refetches through tRPC as
usual. No meetup data goes through Ably. Without an `ABLY_API_KEY` pages
refresh only after your own changes, and everything else works as before.

### How email works

Sign-in links and meetup invites go out through Resend's REST API (plain
fetch, no SDK) from `noreply@notify.billfugina.com`, or whatever `EMAIL_FROM`
says. Any member can email the meetup's link to up to 10 addresses at a time
from the meetup page. People already in the meetup are skipped, the same
address isn't emailed about the same meetup twice in 24 hours, and one member
can send at most 20 invites a day, so the form can't be used to send mail in
bulk. A send that hits a rate limit or a server error is retried twice with
the same idempotency key, so a retry never sends a second copy. Without a
`RESEND_API_KEY`, sign-in links are written to the server log instead and the
invite form is hidden.

Under the form, "Email invites" lists each invited address with when it was
last sent and whether someone with that address has joined. The organizer sees
every invite; other members see only the ones they sent, since the addresses
belong to other people.

### How the vote stays anonymous

When a member votes, one SQL statement writes two unlinked rows: a receipt
(meetup and member, so turnout and "already voted" work) and a ballot (meetup,
ranking, and a hash of a one-time token). Neither has a timestamp. The token
goes back to the voter's browser and is the only way to see or change that
ballot before voting closes. Turnout is shown during the vote, but no totals.
The honest limit: someone with database access while voting is open could try
to match rows by insert order or timing, so this is privacy from other
members, not from the operator.

## Stack

| Layer    | Choice                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Web      | Vite + React single-page app, React Router, TanStack Form                      |
| API      | tRPC (fetch adapter) as a Vercel function at `/api/trpc`                       |
| Auth     | Better Auth (email and password, magic link) at `/api/auth`                    |
| MCP      | MCP TypeScript SDK at `/api/mcp`; Better Auth's MCP plugin as its OAuth server |
| Database | Neon Postgres via Drizzle ORM (Neon HTTP driver on Vercel)                     |
| Agent    | Claude via the Anthropic TypeScript SDK, with a small tool loop on the server  |
| Hosting  | Vercel: static SPA on the CDN, API as functions, a preview per branch          |
| CI       | GitHub Actions: lint, format, typecheck, migrations, drift check, tests, build |

Ably (live updates) and Resend (email) sit behind small adapters. Later: Inngest
(durable workflows) behind one too.

## Layout

```
api/            Vercel functions (thin wrappers around server/handlers.ts)
server/         tRPC routers, Better Auth, Drizzle schema and client, env
server/meetups/ meetup logic the routers call: members, shortlist, vote
server/agent/   the private check-in: planner prompt, tools and turn loop
server/mcp/     the MCP server for members' own agents (wraps the planner tools)
server/email/   the email adapter (Resend or the log) and the email templates
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
the Vercel functions use, so local behaves like a deploy. Without a
`RESEND_API_KEY` in `.env`, magic links are written to the API's log.

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
4. Optional: add `ANTHROPIC_API_KEY` for Production and Preview to switch on
   the planner chat. `PLANNER_MODEL` and `PLANNER_EFFORT` override its model
   (default `claude-haiku-5-5`, the cheapest; `claude-sonnet-5-5` or
   `claude-opus-5-5` cost more) and effort (default `low`).
5. Optional: add `ABLY_API_KEY` for Production and Preview so pages refresh
   by themselves. Create the key in Ably with only Publish and Subscribe, and
   limit it to channels matching `meetup:*`.
6. Optional: add `RESEND_API_KEY` for Production and Preview to email sign-in
   links and invites. Verify the sending domain in Resend first and give the
   key sending access only. `EMAIL_FROM` changes the sender (default
   `tiny-bee <noreply@notify.billfugina.com>`).
7. Push a branch: Vercel builds a preview, the build migrates that preview's
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
