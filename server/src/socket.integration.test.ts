import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocketAccessToken } from "./auth.js";

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
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  enemiesDefeated: number;
  status: "alive" | "defeated";
};

type GameState = {
  roomId: string;
  matchId?: string;
  hostPlayerId?: string;
  map: string[];
  exit: Position;
  players: PublicPlayer[];
  enemies: PublicEnemy[];
  status: "active" | "victory" | "defeat";
};

const SOCKET_TEST_SECRET = "test-only-socket-secret-at-least-32-bytes";

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

  if (!player || player.status !== "alive") return null;

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

function nextJoinedPlayerId(socket: Socket) {
  return new Promise<string>((resolve) => {
    socket.once("lobby:joined", ({ playerId }: { playerId: string }) => {
      resolve(playerId);
    });
  });
}

function nextAppError(socket: Socket) {
  return new Promise<{ message: string }>((resolve) => {
    socket.once("app:error", resolve);
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
  const clients: Socket[] = [];

  function openClient(token?: string) {
    const socket = io(`http://127.0.0.1:${port}`, {
      ...(token ? { auth: { token } } : {}),
      reconnection: false,
      timeout: 3000,
    });
    clients.push(socket);
    return socket;
  }

  async function connectClient(userId: string) {
    const token = await createSocketAccessToken(userId, SOCKET_TEST_SECRET);
    const socket = openClient(token);

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });

    return socket;
  }

  beforeAll(async () => {
    port = await allocatePort();
    serverProcess = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          RECONNECT_GRACE_MS: "1000",
          SOCKET_AUTH_SECRET: SOCKET_TEST_SECRET,
        },
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

    const firstToken = await createSocketAccessToken(
      "github:test-player-one",
      SOCKET_TEST_SECRET
    );
    const secondToken = await createSocketAccessToken(
      "github:test-player-two",
      SOCKET_TEST_SECRET
    );
    openClient(firstToken);
    openClient(secondToken);

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
      const firstPlayerIdPromise = nextJoinedPlayerId(first);
      const firstJoin = nextGameState(
        first,
        roomId,
        (state) => state.players.length === 1
      );
      first.emit("lobby:join", { roomId, playerName: "Combatiente A" });
      await firstJoin;
      const firstPlayerId = await firstPlayerIdPromise;

      const secondPlayerIdPromise = nextJoinedPlayerId(second);
      const bothJoined = [
        nextGameState(first, roomId, (state) => state.players.length === 2),
        nextGameState(second, roomId, (state) => state.players.length === 2),
      ];
      second.emit("lobby:join", { roomId, playerName: "Combatiente B" });
      let [firstState, secondState] = await Promise.all(bothJoined);
      const secondPlayerId = await secondPlayerIdPromise;

      const spoofedIdentityError = new Promise<{ message: string }>((resolve) => {
        second.once("app:error", resolve);
      });
      second.emit("game:move", {
        direction: "right",
        playerId: firstPlayerId,
        userId: "github:test-player-one",
      });
      await expect(spoofedIdentityError).resolves.toMatchObject({
        message: expect.any(String),
      });
      expect(firstState.players).toEqual(secondState.players);

      expect(firstState.map).toEqual(secondState.map);
      expect(firstState.enemies).toEqual(secondState.enemies);
      expect(firstState.players).toEqual(secondState.players);
      expect(firstState.players).toHaveLength(2);
      expect(firstState.players).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hp: 100,
            maxHp: 100,
            level: 1,
            xp: 0,
            status: "alive",
          }),
        ])
      );
      const initialPlayerHealth = new Map(
        firstState.players.map(({ id, hp }) => [id, hp])
      );

      let attackerId = firstPlayerId;
      let attacker = first;
      let route = findAttackRoute(firstState, attackerId);

      if (!route) {
        attackerId = secondPlayerId;
        attacker = second;
        route = findAttackRoute(firstState, attackerId);
      }

      expect(route).not.toBeNull();
      if (!route) throw new Error("No reachable adjacent enemy was generated.");

      let damageObserved = false;
      for (let stepCount = 0; stepCount < 100; stepCount++) {
        if (!route || route.path.length === 0) break;

        const direction = route.path[0];
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
        await new Promise((resolve) => setTimeout(resolve, 155));
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
        expect(firstState.players).toEqual(secondState.players);
        damageObserved ||= firstState.players.some(
          ({ id, hp }) =>
            hp < (initialPlayerHealth.get(id) ?? hp)
        );
        route = findAttackRoute(firstState, attackerId);
      }

      expect(route?.path).toHaveLength(0);
      if (!route || route.path.length !== 0) {
        throw new Error("The attacker could not reach an adjacent enemy.");
      }

      const attackRoute = route;
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
      expect(firstState.players).toEqual(secondState.players);
      damageObserved ||= firstState.players.some(
        ({ id, hp }) => hp < (initialPlayerHealth.get(id) ?? hp)
      );

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

      await new Promise((resolve) => setTimeout(resolve, 260));
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
        maxHp: 100,
        level: 1,
        xp: 75,
        enemiesDefeated: 1,
      });
      expect(firstState.players).toEqual(secondState.players);
      expect(damageObserved).toBe(true);
      expect(
        firstState.players.find(({ id }) => id === attackerId)
      ).toEqual(
        secondState.players.find(({ id }) => id === attackerId)
      );
      expect(
        firstState.players.find(({ id }) => id !== attackerId)
      ).toMatchObject({
        maxHp: 100,
        level: 1,
        xp: 0,
        enemiesDefeated: 0,
      });
    },
    30000
  );

  it("rejects the ninth lobby join without emitting state for its target room", async () => {
    const socket = await connectClient("github:rate-limit-test");
    const sourceRoomId = `rls-${Date.now()}`;
    const targetRoomId = `rlt-${Date.now()}`;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const joined = nextJoinedPlayerId(socket);
      socket.emit("lobby:join", {
        roomId: sourceRoomId,
        playerName: "Limit test",
      });
      await joined;
    }

    let targetRoomWasBroadcast = false;
    socket.on("game:state", (state: GameState) => {
      if (state.roomId === targetRoomId) targetRoomWasBroadcast = true;
    });
    const limited = new Promise<{ message: string }>((resolve) => {
      socket.once("app:error", resolve);
    });
    socket.emit("lobby:join", {
      roomId: targetRoomId,
      playerName: "Limit test",
    });

    await expect(limited).resolves.toMatchObject({
      message: expect.any(String),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(targetRoomWasBroadcast).toBe(false);
  });

  it("rejects Socket.IO handshakes without a valid access token", async () => {
    const expiredToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("rogueweb-web")
      .setAudience("rogueweb-socket")
      .setSubject("github:expired")
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_001)
      .sign(new TextEncoder().encode(SOCKET_TEST_SECRET));
    const wrongAudienceToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("rogueweb-web")
      .setAudience("rogueweb-other")
      .setSubject("github:wrong-audience")
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SOCKET_TEST_SECRET));

    for (const token of [undefined, "invalid-token", expiredToken, wrongAudienceToken]) {
      const socket = openClient(token);
      const message = await new Promise<string>((resolve) => {
        socket.once("connect_error", (error: Error) => resolve(error.message));
      });
      expect(message).toMatch(/unauthorized/i);
      socket.disconnect();
    }
  });

  it("restores a disconnected player's room within grace and cleans it after expiry", async () => {
    const userId = `github:resume-${Date.now()}`;
    const roomId = `rec-${Date.now()}`;
    const firstSocket = await connectClient(userId);
    const firstPlayerIdPromise = nextJoinedPlayerId(firstSocket);
    const firstStatePromise = nextGameState(
      firstSocket,
      roomId,
      (state) => state.players.length === 1
    );
    firstSocket.emit("lobby:join", { roomId, playerName: "Reconexión" });
    const [firstPlayerId, firstState] = await Promise.all([
      firstPlayerIdPromise,
      firstStatePromise,
    ]);

    const activeReplacement = await connectClient(userId);
    const activeReplacementIdPromise = nextJoinedPlayerId(activeReplacement);
    const activeReplacementStatePromise = nextGameState(
      activeReplacement,
      roomId,
      (state) => state.players.length === 1
    );
    activeReplacement.emit("lobby:join", {
      roomId,
      playerName: "Reconexión",
    });
    const [activeReplacementId, activeReplacementState] = await Promise.all([
      activeReplacementIdPromise,
      activeReplacementStatePromise,
    ]);
    expect(activeReplacementId).toBe(firstPlayerId);
    expect(activeReplacementState.matchId).toBe(firstState.matchId);
    await new Promise<void>((resolve) => {
      if (!firstSocket.connected) {
        resolve();
        return;
      }
      firstSocket.once("disconnect", () => resolve());
    });

    activeReplacement.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const resumedSocket = await connectClient(userId);
    const resumedPlayerIdPromise = nextJoinedPlayerId(resumedSocket);
    const resumedStatePromise = nextGameState(
      resumedSocket,
      roomId,
      (state) => state.players.length === 1
    );
    resumedSocket.emit("lobby:join", { roomId, playerName: "Reconexión" });
    const [resumedPlayerId, resumedState] = await Promise.all([
      resumedPlayerIdPromise,
      resumedStatePromise,
    ]);
    expect(resumedPlayerId).toBe(firstPlayerId);
    expect(resumedState.matchId).toBe(firstState.matchId);

    const observer = await connectClient(`github:observer-${Date.now()}`);
    const observerJoined = nextGameState(
      observer,
      roomId,
      (state) => state.players.length === 2
    );
    observer.emit("lobby:join", { roomId, playerName: "Observador" });
    await observerJoined;

    let stateAfterGrace: GameState | undefined;
    resumedSocket.on("game:state", (state: GameState) => {
      if (state.roomId === roomId) stateAfterGrace = state;
    });
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(stateAfterGrace?.players).toHaveLength(2);
    expect(stateAfterGrace?.players.some(({ id }) => id === firstPlayerId)).toBe(
      true
    );

    resumedSocket.disconnect();
    observer.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1_300));

    const replacementSocket = await connectClient(userId);
    const replacementPlayerIdPromise = nextJoinedPlayerId(replacementSocket);
    const replacementStatePromise = nextGameState(
      replacementSocket,
      roomId,
      (state) => state.players.length === 1
    );
    replacementSocket.emit("lobby:join", { roomId, playerName: "Reconexión" });
    const [replacementPlayerId, replacementState] = await Promise.all([
      replacementPlayerIdPromise,
      replacementStatePromise,
    ]);

    expect(replacementPlayerId).not.toBe(firstPlayerId);
    expect(replacementState.matchId).not.toBe(firstState.matchId);
  }, 10000);

  it("rejects non-members and non-host or active-room restarts", async () => {
    const host = await connectClient(`github:host-${Date.now()}`);
    const guest = await connectClient(`github:guest-${Date.now()}`);
    const roomId = `rst-${Date.now()}`;
    const hostStatePromise = nextGameState(
      host,
      roomId,
      (state) => state.players.length === 1
    );
    host.emit("lobby:join", { roomId, playerName: "Host" });
    const activeState = await hostStatePromise;

    const nonMemberError = nextAppError(guest);
    guest.emit("game:move", { direction: "up" });
    await expect(nonMemberError).resolves.toMatchObject({
      message: expect.any(String),
    });

    const guestJoined = nextGameState(
      guest,
      roomId,
      (state) => state.players.length === 2
    );
    guest.emit("lobby:join", { roomId, playerName: "Guest" });
    await guestJoined;

    const guestRestartError = nextAppError(guest);
    guest.emit("game:restart", {});
    await expect(guestRestartError).resolves.toMatchObject({
      message: "Solo quien creó la sala puede reiniciarla.",
    });

    const hostRestartError = nextAppError(host);
    host.emit("game:restart", {});
    await expect(hostRestartError).resolves.toMatchObject({
      message: "Solo se puede reiniciar una partida terminada.",
    });
    expect(activeState.status).toBe("active");
  });
});
