import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Direction = "up" | "down" | "left" | "right";

type Position = {
  x: number;
  y: number;
};

type PublicEnemy = Position & {
  id: string;
  hp: number;
  status: "alive" | "defeated";
};

type PublicPlayer = Position & {
  id: string;
  name: string;
  xp: number;
  enemiesDefeated: number;
};

type GameState = {
  roomId: string;
  map: string[];
  players: PublicPlayer[];
  enemies: PublicEnemy[];
};

const DIRECTIONS: Array<{
  direction: Direction;
  dx: number;
  dy: number;
}> = [
  { direction: "up", dx: 0, dy: -1 },
  { direction: "down", dx: 0, dy: 1 },
  { direction: "left", dx: -1, dy: 0 },
  { direction: "right", dx: 1, dy: 0 },
];

function positionKey(position: Position) {
  return `${position.x},${position.y}`;
}

function findAttackRoute(
  state: GameState,
  playerId: string
): { path: Direction[]; attackDirection: Direction; enemyId: string } | null {
  const player = state.players.find(({ id }) => id === playerId);

  if (!player) return null;

  const otherPlayers = new Set(
    state.players
      .filter(({ id }) => id !== playerId)
      .map(positionKey)
  );
  const livingEnemies = state.enemies.filter(
    ({ status }) => status === "alive"
  );

  for (const enemy of livingEnemies) {
    for (const attack of DIRECTIONS) {
      const goal = {
        x: enemy.x - attack.dx,
        y: enemy.y - attack.dy,
      };
      const goalKey = positionKey(goal);

      if (
        state.map[goal.y]?.[goal.x] !== "." ||
        otherPlayers.has(goalKey) ||
        livingEnemies.some(
          (other) => other.id !== enemy.id && positionKey(other) === goalKey
        )
      ) {
        continue;
      }

      const queue: Position[] = [player];
      const previous = new Map<
        string,
        { position: string; direction: Direction } | null
      >([[positionKey(player), null]]);

      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        const currentKey = positionKey(current);

        if (currentKey === goalKey) break;

        for (const step of DIRECTIONS) {
          const next = {
            x: current.x + step.dx,
            y: current.y + step.dy,
          };
          const nextKey = positionKey(next);

          if (
            state.map[next.y]?.[next.x] !== "." ||
            otherPlayers.has(nextKey) ||
            previous.has(nextKey) ||
            livingEnemies.some(({ x, y }) => x === next.x && y === next.y)
          ) {
            continue;
          }

          previous.set(nextKey, {
            position: currentKey,
            direction: step.direction,
          });
          queue.push(next);
        }
      }

      if (!previous.has(goalKey)) continue;

      const path: Direction[] = [];
      let currentKey = goalKey;

      while (currentKey !== positionKey(player)) {
        const step = previous.get(currentKey);

        if (!step) return null;

        path.unshift(step.direction);
        currentKey = step.position;
      }

      return {
        path,
        attackDirection: attack.direction,
        enemyId: enemy.id,
      };
    }
  }

  return null;
}

function nextGameState(
  socket: Socket,
  roomId: string,
  predicate: (state: GameState) => boolean
) {
  return new Promise<GameState>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("game:state", onState);
      reject(new Error("Timed out waiting for authoritative game state."));
    }, 8000);

    const onState = (state: GameState) => {
      if (state.roomId !== roomId || !predicate(state)) return;

      clearTimeout(timeout);
      socket.off("game:state", onState);
      resolve(state);
    };

    socket.on("game:state", onState);
  });
}

async function allocatePort() {
  const listener = createServer();

  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });

  const address = listener.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate an integration-test port.");
  }

  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });

  return address.port;
}

describe("Socket.IO authoritative combat", () => {
  let port: number;
  let serverProcess: ChildProcess | undefined;
  let stderr = "";
  let clients: Socket[] = [];

  beforeAll(async () => {
    port = await allocatePort();
    serverProcess = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "ignore", "pipe"],
      }
    );
    serverProcess.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`Test server exited early: ${stderr}`);
      }

      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);

        if (response.ok) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const first = io(`http://127.0.0.1:${port}`, {
      reconnection: false,
      timeout: 3000,
    });
    const second = io(`http://127.0.0.1:${port}`, {
      reconnection: false,
      timeout: 3000,
    });
    clients = [first, second];

    await Promise.all(
      clients.map(
        (socket) =>
          new Promise<void>((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("connect_error", reject);
          })
      )
    );
  }, 20000);

  afterAll(async () => {
    clients.forEach((socket) => socket.disconnect());

    if (serverProcess && serverProcess.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          serverProcess?.kill();
          resolve();
        }, 3000);
        serverProcess?.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        serverProcess?.kill();
      });
    }
  });

  it(
    "broadcasts the same server-calculated damage and defeat to both clients",
    async () => {
      const [first, second] = clients;
      const roomId = `combat-${Date.now()}`;
      const firstJoin = nextGameState(
        first,
        roomId,
        (state) => state.players.length === 1
      );
      first.emit("lobby:join", { roomId, playerName: "Combatiente A" });
      await firstJoin;

      const bothJoined = [
        nextGameState(first, roomId, (state) => state.players.length === 2),
        nextGameState(second, roomId, (state) => state.players.length === 2),
      ];
      second.emit("lobby:join", { roomId, playerName: "Combatiente B" });
      let [firstState, secondState] = await Promise.all(bothJoined);

      expect(firstState.map).toEqual(secondState.map);
      expect(firstState.enemies).toEqual(secondState.enemies);

      const firstId = first.id;
      const secondId = second.id;

      if (!firstId || !secondId) {
        throw new Error("Connected test clients must have socket IDs.");
      }

      let attackerId = firstId;
      let route = findAttackRoute(firstState, firstId);
      let attacker = first;

      if (!route) {
        route = findAttackRoute(firstState, secondId);
        attacker = second;
        attackerId = secondId;
      }

      expect(route).not.toBeNull();

      if (!route) {
        throw new Error("No reachable adjacent enemy was generated.");
      }

      const attackRoute = route;

      for (const direction of attackRoute.path) {
        const currentPlayer = firstState.players.find(
          ({ id }) => id === attackerId
        );
        const step = DIRECTIONS.find(
          ({ direction: candidate }) => candidate === direction
        );

        if (!currentPlayer || !step) {
          throw new Error("Could not resolve the test player's next position.");
        }

        const expectedPosition = {
          x: currentPlayer.x + step.dx,
          y: currentPlayer.y + step.dy,
        };
        const updates = [
          nextGameState(first, roomId, (state) => {
            const player = state.players.find(({ id }) => id === attackerId);
            return (
              player?.x === expectedPosition.x &&
              player.y === expectedPosition.y
            );
          }),
          nextGameState(second, roomId, (state) => {
            const player = state.players.find(({ id }) => id === attackerId);
            return (
              player?.x === expectedPosition.x &&
              player.y === expectedPosition.y
            );
          }),
        ];

        attacker.emit("game:move", { direction });
        [firstState, secondState] = await Promise.all(updates);
      }

      const target = firstState.enemies.find(
        ({ id }) => id === attackRoute.enemyId
      );

      if (!target) {
        throw new Error("The selected enemy is missing from room state.");
      }

      const damagedStates = [
        nextGameState(
          first,
          roomId,
          (state) =>
            state.enemies.find(({ id }) => id === attackRoute.enemyId)?.hp ===
            target.hp - 18
        ),
        nextGameState(
          second,
          roomId,
          (state) =>
            state.enemies.find(({ id }) => id === attackRoute.enemyId)?.hp ===
            target.hp - 18
        ),
      ];
      attacker.emit("game:attack", {
        direction: attackRoute.attackDirection,
      });
      [firstState, secondState] = await Promise.all(damagedStates);

      const firstHit = firstState.enemies.find(
        ({ id }) => id === attackRoute.enemyId
      );
      const secondHit = secondState.enemies.find(
        ({ id }) => id === attackRoute.enemyId
      );

      expect(firstHit).toEqual(secondHit);
      expect(firstHit?.hp).toBe(18);

      const rejectedPayload = new Promise<{ message: string }>((resolve) => {
        attacker.once("app:error", resolve);
      });
      attacker.emit("game:attack", {
        direction: attackRoute.attackDirection,
        damage: 999999,
        targetHp: 0,
      });
      await expect(rejectedPayload).resolves.toMatchObject({
        message: expect.any(String),
      });

      const defeatedStates = [
        nextGameState(
          first,
          roomId,
          (state) =>
            state.enemies.find(({ id }) => id === attackRoute.enemyId)?.status ===
            "defeated"
        ),
        nextGameState(
          second,
          roomId,
          (state) =>
            state.enemies.find(({ id }) => id === attackRoute.enemyId)?.status ===
            "defeated"
        ),
      ];
      attacker.emit("game:attack", {
        direction: attackRoute.attackDirection,
      });
      [firstState, secondState] = await Promise.all(defeatedStates);

      const firstDefeat = firstState.enemies.find(
        ({ id }) => id === attackRoute.enemyId
      );
      const secondDefeat = secondState.enemies.find(
        ({ id }) => id === attackRoute.enemyId
      );
      const rewardedPlayer = firstState.players.find(
        ({ id }) => id === attackerId
      );

      expect(firstDefeat).toEqual(secondDefeat);
      expect(firstDefeat).toMatchObject({ hp: 0, status: "defeated" });
      expect(rewardedPlayer).toMatchObject({
        xp: 75,
        enemiesDefeated: 1,
      });
    },
    30000
  );
});
