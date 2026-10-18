# RogueWeb: Echoes of the Grid

## Local development

Install the locked dependencies for both packages:

```bash
npm ci
npm --prefix server ci
```

Copy `.env.example` to `.env.local` for the web app. Copy it separately to
`server/.env` for the Socket.IO backend and uncomment the backend-only
`HOST`, `PORT` and `RECONNECT_GRACE_MS` settings there. Fill in credentials
only in local environment files; never commit them. The OAuth provider and
signing secrets must be configured before multiplayer authentication will
work.

Start the frontend:

```bash
npm run dev
```

Start the separate Socket.IO backend in another terminal:

```bash
npm run dev:socket
```

Open `http://localhost:3000`. `/solo` remains available without an account.
`/jugar` requires GitHub sign-in. The web app requests a short-lived signed
token from its server before opening the Socket.IO connection. The backend
defaults to `127.0.0.1:3001`; `/health` is its health check. For a container
deployment set `HOST=0.0.0.0`, an exact comma-separated `CLIENT_ORIGIN`, and a
public `NEXT_PUBLIC_SOCKET_URL` using `wss://`.

### GitHub OAuth setup

Create a GitHub OAuth App in the provider dashboard. Configure the callback
URL to match the environment:

- Local: `http://localhost:3000/api/auth/callback/github`
- Production: `https://<your-web-host>/api/auth/callback/github`

Set `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` and a unique `AUTH_SECRET` in the
web host environment. Configure the same `SOCKET_AUTH_SECRET` (at least 32
bytes) in the web app and Socket.IO backend. Do not place secrets in
`NEXT_PUBLIC_*` variables or paste them into source control.

## PostgreSQL and Prisma

Set `DATABASE_URL` only in the local/server environment, then validate and
generate the Prisma client:

```bash
npx prisma validate
npx prisma generate
```

For a disposable local database, apply checked-in migrations with:

```bash
npx prisma migrate deploy
```

The additive `matchId`/idempotency migration has **not** been applied to
Supabase or any production database. Review the SQL, take an approved backup,
and get explicit approval before applying it to a live database. The deployment
command is `npx prisma migrate deploy`; it changes schema and must be run only
as an approved deployment step.

The seed counts all `MatchHistory` rows and inserts only the deficit to 10,000
in batches of at most 500. It does not delete or replace rows. A sequential
rerun at 10,000 is a no-op, but concurrent seed processes could create logical
duplicates. The user previously confirmed a read-only count of 10,000 rows;
the official rubric's definition of those rows is still unresolved. Do not
re-run the seed against the existing database.

At authoritative multiplayer terminal state, the backend signs a short-lived
match snapshot and calls `MATCH_HISTORY_URL`. The web server validates the
signature and writes one row per authenticated participant. The nullable
`matchId` and unique `(matchId, playerId)` constraint make retries idempotent
without replacing legacy sample records. `/historial` and `/api/telemetry`
return only the signed-in user's paginated public match details, not inventory
or other users' records.

## Checks

From the repository root:

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm test -- --reporter=dot
npm run lint
npm run build
```

For the separate backend:

```bash
npm --prefix server run build
npm --prefix server test -- --reporter=dot
```

GitHub Actions runs locked installs, Prisma validation/generation, frontend
lint/type-check/tests/build, and backend build/tests on pushes and pull
requests. CI uses placeholder credentials and a dummy database URL; it does
not connect to the project's PostgreSQL database.

## Multiplayer lifecycle and deployment

The first player to reach the exit wins for the room; the room loses when all
players are defeated. Only the room host can restart a terminal game. A
disconnected player retains their room state for `RECONNECT_GRACE_MS` (default
30 seconds); reconnecting with the same authenticated account restores it.
Duplicate live sessions replace the earlier socket. Rate limits and reconnect
state are in-memory per backend process, so they are not shared by multiple
replicas; use a shared adapter/store or single backend instance when scaling.

Production requires a host with persistent WebSocket support, HTTPS/WSS,
PostgreSQL network access, exact CORS origins, `HOST=0.0.0.0`, an HTTPS
`MATCH_HISTORY_URL`, OAuth callback registration, and the variables listed in
`.env.example`. Requests without an `Origin` are allowed only for local
development; production accepts only configured origins. No hosting provider
has been selected or configured in this repository.

See [`docs/requirements-audit.md`](docs/requirements-audit.md) for current
evidence and [`docs/oral-defense.md`](docs/oral-defense.md) for a concise
architecture explanation in Spanish.
