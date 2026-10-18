# RogueWeb architecture: oral-defense notes

## Two game modes

- `/solo` owns its maze, player statistics, enemies, and combat inside the
  browser. Phaser draws the state, while the local combat helpers calculate
  movement and damage.
- `/jugar` sends player intentions over one Socket.IO connection. The Node
  server owns each room's map, positions, enemies, health, XP, level, and game
  result. Phaser only renders the public state received through `game:state`.

## What happens on a multiplayer move or attack?

1. The client sends only a direction; it does not send coordinates, damage, or
   a requested result.
2. The server identifies the player from the connected socket and room
   membership, validates the action and applies collision/cooldown rules.
3. On a valid action, the server advances living enemies, calculates damage,
   clamps health, applies defeat or progression, and checks for a terminal
   result.
4. The server explicitly serializes the public room state and broadcasts it to
   all members. Server-only combat values are omitted.
5. Each browser renders that same state. This prevents a modified browser from
   deciding its own health, XP, movement, or enemy defeat.

## Why Phaser does not own multiplayer state

Phaser is a renderer and input source for `/jugar`. If it moved a player or
changed health locally, clients could disagree or bypass collision rules.
Sending intentions and rendering server responses keeps the room synchronized.

## Storage and identity

Prisma 7 connects to PostgreSQL through the PostgreSQL driver adapter. The
`MatchHistory` model and initial migration exist, and the sample seed inserts
records in batches until the table reaches 10,000 rows. The telemetry API reads
that table, but the game server does not yet save real completed matches.

The multiplayer room itself remains in memory and disappears when its last
socket leaves. OAuth, sessions, and protected routes are not implemented:
players currently use the server-generated `socket.id` for the active
connection, while the display name comes from the client. A validated identity
provider and session policy must be agreed before connecting accounts to game
history.

## Multiplayer completion

The first player to reach the exit wins for the room, as confirmed by the
project owner. If every player is defeated, the room is defeated. A terminal
room rejects further actions and new joins. Disconnecting every player removes
it, allowing a fresh room to be generated; an in-game restart control is not
implemented. Reconnecting creates a new socket identity and does not restore
the previous room state. The socket server currently binds to `127.0.0.1`;
production hosting must configure a reachable interface, allowed origin,
HTTPS/WSS, and persistent WebSocket support.
