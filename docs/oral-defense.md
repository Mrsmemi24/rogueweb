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

Room state is currently in memory and disappears when the last socket leaves.
There is no database or authentication layer. Those technologies are
intentionally not guessed: the repository has no official requirement choosing
a database, data model, or OAuth provider. Obtain those decisions before
creating migrations, a large seed, accounts, or session handling.

## Multiplayer completion

The first player to reach the exit wins for the room, as confirmed by the
project owner. If every player is defeated, the room is defeated. A terminal
room rejects further actions and new joins. Disconnecting every player removes
it, allowing a fresh room to be generated; an in-game restart control is not
implemented.
