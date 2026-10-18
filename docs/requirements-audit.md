# RogueWeb requirements audit

## Source of requirements

No official project specification, acceptance-criteria document, or architecture
document was found in the repository. `README.md` describes local development
and the two game modes, but does not define the database, OAuth provider, CI,
or detailed acceptance rules. The statuses below therefore audit the
requirements in the project-completion request as a **provisional checklist**;
they must not be treated as externally approved requirements.

## Requirements matrix

| ID | Provisional requirement | Status | Evidence | Remaining work / verification |
|---|---|---|---|---|
| A1 | Phaser renders the game with Canvas | Implemented | `src/components/PhaserGame.tsx`, `src/components/AuthoritativeCanvas.tsx` configure `Phaser.CANVAS` / `Phaser.CANVAS`; production build | Browser smoke test at `/solo` and `/jugar` on supported browsers |
| A2 | Keyboard movement is continuous, grid-based, and collision checked | Implemented | `src/components/PhaserGame.tsx`; `src/components/AuthoritativeCanvas.tsx`; solo maze tests and backend movement tests | Manual hold/release and wall checks |
| A3 | Mobile controls repeat while held and stop on release/cancel/focus loss | Implemented | `src/components/TouchControls.tsx`; `src/components/OnlineGame.tsx` | Manual touch-device verification, including dragging off each button |
| A4 | Multiplayer movement remains server-authoritative | Implemented | `server/src/game.ts`, `server/src/index.ts`; `server/src/game.test.ts` | Integration test verifies authoritative room updates |
| B1 | Clients send intentions, not coordinates, damage, XP, or status | Implemented | Strict `MoveIntentSchema`, `AttackIntentSchema`; `server/src/game.test.ts` rejects extra fields | Keep schema-strictness tests |
| B2 | Server validates collisions, attacks, enemy turns, stats, defeat, and progression | Implemented | `server/src/game.ts`, `server/src/index.ts`; backend unit and Socket.IO integration tests | Rate controls are action cooldowns, not a general connection/DDoS limiter |
| B3 | Room state is isolated and public state is explicitly serialized | Implemented | `RoomState`, `toPublicGameState`, `toPublicPlayerState`, `toPublicEnemyState` in `server/src/game.ts`; room isolation tests | None identified |
| B4 | Invalid actions do not mutate or broadcast a fabricated state | Implemented | Zod parsing and failed-action early returns in `server/src/index.ts`; model tests | Integration coverage can be expanded for each invalid event |
| B5 | Duplicate joins, disconnect cleanup, and reconnect behavior are safe | Partial | Same-room join reuses existing socket player; disconnect removes player and deletes an empty room in `server/src/index.ts` | Reconnect creates a new socket identity and requires a new join; player state is not resumed |
| B6 | Socket room access is authorized | Partial | Events resolve player and room from `socket.data.roomId`; clients cannot select a room on move/attack | No authenticated user/session identity is implemented; see D1 |
| C1 | Persistent relational schema, migrations, and 10,000-record seed | Blocked | No database package, ORM, schema, migration, or seed exists in the repository; no official document identifies a database or entities | Obtain the official storage requirement and entity/relationship model before choosing a database or creating data |
| D1 | OAuth, secure sessions, protected routes, and authenticated sockets | Blocked | No auth package, session store, OAuth configuration, account model, or provider requirement exists in the repository | Obtain approved provider and identity/session requirements; do not trust a client-supplied ID |
| E1 | Victory on dungeon exit and room-wide terminal state | Implemented | `tryMovePlayer` and public `GameStatus` in `server/src/game.ts`; UI in `src/components/OnlineGame.tsx`; room-wins-on-first-arrival rule confirmed by owner | Manual co-op check |
| E2 | Defeat at zero HP, terminal actions blocked, and state synchronized | Implemented | `advanceEnemies`, `tryMovePlayer`, `tryAttackPlayer`, `game:state`; `server/src/game.test.ts` | Manual co-op check |
| E3 | Safe new-game / restart flow | Partial | Empty-room cleanup deletes the in-memory room; a new room ID starts a new seed | No in-game restart or leave control; for a terminal room every client must disconnect before that ID can be reused |
| E4 | Solo and multiplayer preserve appropriate game rules | Implemented | `src/game/combat.ts`, `src/components/PhaserGame.tsx`, `server/src/game.ts`; frontend and backend tests | Manual gameplay parity check |
| F1 | CI runs install, typecheck, tests, lint, and both builds | Implemented | `.github/workflows/ci.yml` runs locked installs and project scripts on pushes and pull requests | Workflow has not been run by GitHub Actions in this workspace |
| F2 | Database migration/seed checks in CI | Blocked | No database/schema/seed implementation to validate | Revisit only after C1 is specified and implemented |
| G1 | Multiplayer input validation and action rate control | Partial | Strict Zod schemas; 150 ms accepted-move cooldown and 250 ms attack cooldown in `server/src/game.ts` | No connection-level or generic message-rate limiter; deploy behind platform-level abuse protection |
| G2 | Secret handling and production configuration | Partial | `.env*` is ignored by `.gitignore`; `PORT`, `CLIENT_ORIGIN`, and `NEXT_PUBLIC_SOCKET_URL` are configurable | No deployment target/specification; set exact production origin and manage runtime secrets in the selected host |
| G3 | Installation and architecture/oral-defense documentation | Implemented | `README.md`, `docs/oral-defense.md`, this audit | Add deployment guide after host and persistence requirements are known |
| G4 | Responsive/browser compatibility and manual gameplay verification | Partial | Responsive Tailwind layouts and pointer/keyboard handlers exist | Physical mobile and cross-browser checks remain manual |

## Baseline and final verification

At the start of this audit, before its implementation changes:

- Root: TypeScript passed; 59 tests passed; lint passed; frontend production
  build passed.
- `server/`: TypeScript build passed; 37 tests passed.

After the audit changes, local checks completed successfully:

- Root tests: 62 tests passed across 5 files.
- Root lint: passed.
- Frontend production build: passed; `/`, `/jugar`, and `/solo` were generated.
- Root TypeScript check (`npx tsc --noEmit`): passed.
- Backend TypeScript build: passed.
- Backend tests: 40 tests passed across 3 files.
- `git diff --check`: passed.

The GitHub-hosted workflow and any production deployment have not been run
from this workspace. Browser/device checks listed above also remain manual.

## Scope decisions

- No database or OAuth stack was selected because the repository contains no
  official specification selecting a database, data model, or provider.
- In multiplayer, the first player to reach the exit wins for the room. This
  rule was explicitly confirmed by the project owner during this audit.
- A terminal room is removed once every client disconnects; there is no
  unanimous in-game restart control yet.
