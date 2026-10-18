# RogueWeb: Echoes of the Grid

## Local development

Install dependencies once from the repository root:

```bash
npm install
npm --prefix server install
```

Start the game web app in one terminal:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and select **Jugar** (or open `/jugar` directly). The single-player dungeon runs locally and does not need the lobby server.

To use the multiplayer test lobby, start its Socket.IO server in a second terminal:

```bash
npm run dev:socket
```

The web app uses `http://127.0.0.1:3001` for the lobby by default. The server exposes `http://127.0.0.1:3001/health` for a health check. Override the web port with `PORT` when running Next.js, the socket server port with `PORT` in `server`, and the socket URL with `NEXT_PUBLIC_SOCKET_URL` in the web app environment.

The game board is generated in Phaser from canvas shapes; no external game assets or font downloads are required.

## Match-history database

Set `DATABASE_URL` in the root `.env` file to your PostgreSQL connection string:

```env
DATABASE_URL="postgresql://<USER>:<PASSWORD>@localhost:5432/rogueweb?schema=public"
```

With PostgreSQL running, create the schema and load the 10,000 sample match records:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

The seed counts all rows in `MatchHistory` and inserts only enough sample rows
to bring that table to 10,000, in batches of 500. It does not delete or replace
existing records. A sequential rerun after the table reaches 10,000 rows inserts
nothing. Do not run multiple seed processes concurrently: the seed has no
unique marker for sample rows and its count-then-insert steps are not protected
against concurrent writes.

## Project checks

Run the frontend checks from the repository root:

```bash
npx tsc --noEmit
npm test -- --reporter=dot
npm run lint
npm run build
```

Run the backend checks from `server/`:

```bash
npm run build
npm test -- --reporter=dot
```

GitHub Actions runs these checks on pushes and pull requests. The detailed
requirements audit and oral-defense architecture summary are in
[`docs/requirements-audit.md`](docs/requirements-audit.md) and
[`docs/oral-defense.md`](docs/oral-defense.md).

## Multiplayer lifecycle

The first player to reach the exit wins for the room. A room is defeated when
all its players are defeated. Terminal rooms reject actions and new joins;
disconnecting all players removes the in-memory room so it can be generated
again. The current game state is not persisted between server restarts or when
the final player disconnects.
