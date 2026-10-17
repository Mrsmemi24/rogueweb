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
