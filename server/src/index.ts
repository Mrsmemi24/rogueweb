
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { z } from "zod";
import { verifySocketAccessToken } from "./auth.js";
import {
  persistCompletedMatch,
  createCompletedMatchPayload,
} from "./match-history.js";
import {
  HandshakeRateLimiter,
  SocketEventRateLimiter,
} from "./rate-limit.js";
import {
  createPlayer,
  AttackIntentSchema,
  findAvailableSpawn,
  getOrCreateRoom,
  JoinRoomSchema,
  MoveIntentSchema,
  restartRoomState,
  toPublicGameState,
  tryAttackPlayer,
  tryMovePlayer,
  type PublicGameState,
  type Player,
  type RoomState,
} from "./game.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGINS = new Set(
  (process.env.CLIENT_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const socketAuthSecret = process.env.SOCKET_AUTH_SECRET;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 30_000);

if (!socketAuthSecret || new TextEncoder().encode(socketAuthSecret).length < 32) {
  throw new Error("SOCKET_AUTH_SECRET must be configured with at least 32 bytes");
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

if (!HOST.trim()) {
  throw new Error("HOST must not be empty");
}

if (
  !Number.isInteger(RECONNECT_GRACE_MS) ||
  RECONNECT_GRACE_MS < 1_000 ||
  RECONNECT_GRACE_MS > 300_000
) {
  throw new Error("RECONNECT_GRACE_MS must be between 1000 and 300000");
}

if (process.env.NODE_ENV === "production" && CLIENT_ORIGINS.size === 0) {
  throw new Error("CLIENT_ORIGIN must be configured in production");
}

if (process.env.NODE_ENV === "production") {
  const matchHistoryUrl = process.env.MATCH_HISTORY_URL;
  if (!matchHistoryUrl || new URL(matchHistoryUrl).protocol !== "https:") {
    throw new Error("MATCH_HISTORY_URL must use HTTPS in production");
  }
}

const ReadySchema = z
  .object({
    ready: z.boolean(),
  })
  .strict();
const EmptyPayloadSchema = z.object({}).strict();

type LobbyPlayer = Pick<Player, "id" | "name" | "ready" | "x" | "y">;
type LobbyState = {
  roomId: string;
  players: LobbyPlayer[];
};

interface ClientToServerEvents {
  "lobby:join": (payload: unknown) => void;
  "lobby:ready": (payload: unknown) => void;
  "game:move": (payload: unknown) => void;
  "game:attack": (payload: unknown) => void;
  "game:restart": (payload: unknown) => void;
  "lobby:leave": (payload: unknown) => void;
}

interface ServerToClientEvents {
  "lobby:state": (state: LobbyState) => void;
  "lobby:joined": (payload: { playerId: string }) => void;
  "game:state": (state: PublicGameState) => void;
  "app:error": (payload: { message: string }) => void;
}

type InterServerEvents = Record<
  string,
  (...args: never[]) => void
>;

interface SocketData {
  userId: string;
  roomId?: string;
  tokenExpiresAt: number;
  superseded?: boolean;
}

const httpServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json",
    });

    response.end(
      JSON.stringify({
        ok: true,
        service: "rogueweb-socket-server",
      })
    );

    return;
  }

  response.writeHead(404, {
    "Content-Type": "application/json",
  });

  response.end(JSON.stringify({ error: "Not found" }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const isDevelopment = process.env.NODE_ENV !== "production";
      const isLocalOrigin =
        isDevelopment &&
        origin !== undefined &&
        /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
      const isAllowedOrigin =
        origin !== undefined && CLIENT_ORIGINS.has(origin);
      const isAllowedNoOrigin = isDevelopment && origin === undefined;

      if (isLocalOrigin || isAllowedOrigin || isAllowedNoOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST"],
  },
});

const handshakeRateLimiter = new HandshakeRateLimiter();
const eventRateLimiter = new SocketEventRateLimiter();

io.use(async (socket, next) => {
  const remoteAddress = socket.conn.remoteAddress ?? "unknown";

  if (!handshakeRateLimiter.allow(remoteAddress)) {
    next(new Error("Connection rate limit exceeded"));
    return;
  }

  try {
    const identity = await verifySocketAccessToken(
      socket.handshake.auth?.token,
      socketAuthSecret
    );
    socket.data.userId = identity.userId;
    socket.data.tokenExpiresAt = identity.expiresAt;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

const rooms = new Map<string, RoomState>();
const activeSocketByUser = new Map<string, string>();
const pendingDisconnects = new Map<
  string,
  { roomId: string; timer: NodeJS.Timeout }
>();

function clearPendingDisconnect(userId: string) {
  const pending = pendingDisconnects.get(userId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingDisconnects.delete(userId);
}

function broadcastLobby(roomId: string) {
  const room = rooms.get(roomId);

  if (!room) return;

  io.to(roomId).emit("lobby:state", {
    roomId,
    players: Array.from(room.players.values(), (player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      x: player.x,
      y: player.y,
    })),
  });
}

function broadcastGame(roomId: string) {
  const room = rooms.get(roomId);

  if (!room) return;

  const state: PublicGameState = toPublicGameState(roomId, room);
  io.to(roomId).emit("game:state", state);
}

function removePlayerFromRoom(
  roomId: string,
  userId: string
) {
  const room = rooms.get(roomId);

  if (!room) return;

  clearPendingDisconnect(userId);
  room.players.delete(userId);
  if (room.hostUserId === userId) {
    room.hostUserId = room.players.values().next().value?.userId;
  }

  if (room.players.size === 0) {
    rooms.delete(roomId);
    return;
  }

  broadcastLobby(roomId);
  broadcastGame(roomId);
}

function isCurrentSession(socket: import("socket.io").Socket) {
  return activeSocketByUser.get(socket.data.userId) === socket.id;
}

function persistTerminalMatch(room: RoomState) {
  if (room.persistenceState === "pending" || room.persistenceState === "saved") {
    return;
  }

  let payload;
  try {
    payload = createCompletedMatchPayload(room);
  } catch (error) {
    const errorName =
      error instanceof Error ? error.name.slice(0, 64) : "UnknownError";
    console.error(
      `Could not create completed match record for ${room.matchId ?? "unknown"} (${errorName}).`
    );
    room.persistenceState = "failed";
    return;
  }

  if (!payload) return;
  room.persistenceState = "pending";
  void persistCompletedMatch(payload).then((saved) => {
    if (room.matchId === payload.matchId) {
      room.persistenceState = saved ? "saved" : "failed";
    }
  }).catch((error: unknown) => {
    const errorName =
      error instanceof Error ? error.name.slice(0, 64) : "UnknownError";
    console.error(
      `Match-history persistence failed for match ${payload.matchId} (${errorName}).`
    );
    if (room.matchId === payload.matchId) {
      room.persistenceState = "failed";
    }
  });
}

io.on("connection", (socket) => {
  console.log("Cliente autenticado conectado.");
  const expirationTimer = setTimeout(
    () => socket.disconnect(true),
    Math.max(0, socket.data.tokenExpiresAt - Date.now())
  );
  expirationTimer.unref();

  socket.use((packet, next) => {
    const eventName = typeof packet[0] === "string" ? packet[0] : "";
    const decision = eventRateLimiter.consume(socket.id, eventName);

    if (decision === "allowed") {
      next();
      return;
    }

    socket.emit("app:error", {
      message: "Has enviado demasiadas acciones. Espera un momento.",
    });

    if (decision === "disconnect") {
      eventRateLimiter.clear(socket.id);
      socket.disconnect(true);
      return;
    }

    next(new Error("Rate limit exceeded"));
  });

  socket.on("lobby:join", async (payload) => {
    if (socket.data.superseded) {
      socket.emit("app:error", {
        message: "Esta conexión fue reemplazada por una sesión más reciente.",
      });
      return;
    }

    const result = JoinRoomSchema.safeParse(payload);

    if (!result.success) {
      socket.emit("app:error", {
        message: "Nombre o identificador de sala inválido.",
      });
      return;
    }

    const { roomId, playerName } = result.data;
    const previousRoom = socket.data.roomId;
    const userId = socket.data.userId;
    const pending = pendingDisconnects.get(userId);

    if (pending && pending.roomId !== roomId) {
      socket.emit("app:error", {
        message: "Debes reconectarte a tu sala anterior antes de cambiar.",
      });
      return;
    }

    // Entrar de nuevo a la misma sala no debe duplicar al jugador.
    if (previousRoom === roomId) {
      const existing = rooms.get(roomId)?.players.get(userId);

      if (existing) {
        existing.name = playerName;
        socket.emit("lobby:joined", { playerId: existing.id });
        broadcastLobby(roomId);
        broadcastGame(roomId);
        return;
      }
    }

    const targetRoom = rooms.get(roomId);

    if (targetRoom && targetRoom.status !== "active") {
      socket.emit("app:error", {
        message: "La partida de esa sala ya terminó. Inicia una sala nueva.",
      });
      return;
    }

    if (
      targetRoom &&
      !targetRoom.players.has(userId) &&
      targetRoom.players.size >= targetRoom.dungeon.spawns.length
    ) {
      socket.emit("app:error", {
        message: "La sala está llena. El máximo es de cuatro jugadores.",
      });
      return;
    }

    const room =
      targetRoom ??
      getOrCreateRoom(rooms, roomId, randomInt(0, 0x1_0000_0000));
    room.hostUserId ??= userId;
    room.matchId ??= randomUUID();
    room.startedAt ??= Date.now();
    const existingPlayer = room.players.get(userId);
    const spawn = existingPlayer ? undefined : findAvailableSpawn(room);

    if (!existingPlayer && !spawn) {
      if (room.players.size === 0) {
        rooms.delete(roomId);
      }

      socket.emit("app:error", {
        message: "No quedan posiciones de aparición libres.",
      });
      return;
    }

    const previousSocketId = activeSocketByUser.get(userId);
    const previousSocket =
      previousSocketId && previousSocketId !== socket.id
        ? io.sockets.sockets.get(previousSocketId)
        : undefined;

    if (previousSocket?.data.roomId && previousSocket.data.roomId !== roomId) {
      const oldRoomId = previousSocket.data.roomId;
      removePlayerFromRoom(oldRoomId, userId);
      await previousSocket.leave(oldRoomId);
      previousSocket.data.roomId = undefined;
    }

    // Solo abandonamos la sala anterior si la nueva es válida.
    if (previousRoom && previousRoom !== roomId) {
      removePlayerFromRoom(previousRoom, userId);
      await socket.leave(previousRoom);
    }

    clearPendingDisconnect(userId);
    const player =
      existingPlayer ??
      createPlayer(randomUUID(), playerName, spawn!, userId);
    player.name = playerName;
    room.players.set(userId, player);

    activeSocketByUser.set(userId, socket.id);
    socket.data.roomId = roomId;
    await socket.join(roomId);

    if (previousSocket) {
      previousSocket.data.superseded = true;
    }
    previousSocket?.disconnect(true);
    socket.emit("lobby:joined", { playerId: player.id });
    broadcastLobby(roomId);
    broadcastGame(roomId);

    console.log("Un jugador autenticado entró en una sala.");
  });

  socket.on("lobby:ready", (payload) => {
    const result = ReadySchema.safeParse(payload);

    if (!result.success) {
      socket.emit("app:error", {
        message: "El estado de preparación no es válido.",
      });
      return;
    }

    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    const player = room?.players.get(socket.data.userId);

    if (!isCurrentSession(socket) || !roomId || !room || !player) {
      socket.emit("app:error", {
        message: "Primero debes entrar en una sala.",
      });
      return;
    }

    if (room.status !== "active") {
      socket.emit("app:error", {
        message: "La partida de esta sala ya terminó.",
      });
      return;
    }

    player.ready = result.data.ready;
    broadcastLobby(roomId);
  });

  socket.on("lobby:leave", async (payload) => {
    if (!EmptyPayloadSchema.safeParse(payload).success) {
      socket.emit("app:error", { message: "La solicitud para salir no es válida." });
      return;
    }

    const roomId = socket.data.roomId;
    if (!isCurrentSession(socket) || !roomId) return;

    if (activeSocketByUser.get(socket.data.userId) === socket.id) {
      activeSocketByUser.delete(socket.data.userId);
    }
    socket.data.roomId = undefined;
    removePlayerFromRoom(roomId, socket.data.userId);
    await socket.leave(roomId);
  });

  socket.on("game:move", (payload) => {
    // Nunca confiamos en coordenadas enviadas por el navegador.
    const result = MoveIntentSchema.safeParse(payload);

    if (!result.success) {
      socket.emit("app:error", {
        message: "Movimiento inválido.",
      });
      return;
    }

    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;

    if (!isCurrentSession(socket) || !roomId || !room) {
      socket.emit("app:error", {
        message: "Debes entrar en una sala antes de moverte.",
      });
      return;
    }

    const statusBeforeAction = room.status;
    const moveResult = tryMovePlayer(
      room,
      socket.data.userId,
      result.data.direction
    );

    if (!moveResult.ok) {
      const errorMessages = {
        "invalid-direction": "Movimiento inválido.",
        "player-not-found": "No se encontró al jugador en la sala.",
        defeated: "Un jugador derrotado no puede moverse.",
        "game-over": "La partida de esta sala ya terminó.",
        cooldown: "Espera un instante antes de volver a moverte.",
        "outside-map": "No puedes salir del tablero.",
        wall: "Movimiento bloqueado por una pared.",
        occupied: "Esa casilla ya está ocupada.",
        "enemy-occupied": "Un centinela bloquea esa casilla.",
      };
      socket.emit("app:error", {
        message: errorMessages[moveResult.reason],
      });
      return;
    }

    // Todos los jugadores reciben el estado autorizado.
    broadcastGame(roomId);
    if (statusBeforeAction === "active" && room.status !== "active") {
      persistTerminalMatch(room);
    }
  });

  socket.on("game:attack", (payload) => {
    const result = AttackIntentSchema.safeParse(payload);

    if (!result.success) {
      socket.emit("app:error", {
        message: "El ataque debe indicar una dirección válida.",
      });
      return;
    }

    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;

    if (!isCurrentSession(socket) || !roomId || !room) {
      socket.emit("app:error", {
        message: "Debes entrar en una sala antes de atacar.",
      });
      return;
    }

    const statusBeforeAction = room.status;
    const attackResult = tryAttackPlayer(
      room,
      socket.data.userId,
      result.data.direction
    );

    if (!attackResult.ok) {
      const errorMessages = {
        "invalid-direction": "Dirección de ataque inválida.",
        "player-not-found": "No se encontró al jugador en la sala.",
        defeated: "Un jugador derrotado no puede atacar.",
        "game-over": "La partida de esta sala ya terminó.",
        cooldown: "Debes esperar antes de volver a atacar.",
        "no-enemy": "No hay un centinela en esa dirección.",
      };
      socket.emit("app:error", {
        message: errorMessages[attackResult.reason],
      });
      return;
    }

    broadcastGame(roomId);
    if (statusBeforeAction === "active" && room.status !== "active") {
      persistTerminalMatch(room);
    }
  });

  socket.on("game:restart", (payload) => {
    if (!EmptyPayloadSchema.safeParse(payload).success) {
      socket.emit("app:error", { message: "La solicitud de reinicio no es válida." });
      return;
    }

    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (
      !isCurrentSession(socket) ||
      !roomId ||
      !room ||
      !room.players.has(socket.data.userId)
    ) {
      socket.emit("app:error", { message: "Debes estar en la sala para reiniciarla." });
      return;
    }
    if (room.hostUserId !== socket.data.userId) {
      socket.emit("app:error", { message: "Solo quien creó la sala puede reiniciarla." });
      return;
    }
    if (room.status === "active") {
      socket.emit("app:error", { message: "Solo se puede reiniciar una partida terminada." });
      return;
    }

    for (const player of room.players.values()) {
      if (player.userId) clearPendingDisconnect(player.userId);
    }
    restartRoomState(room, randomInt(0, 0x1_0000_0000));
    room.matchId = randomUUID();
    room.startedAt = Date.now();
    broadcastLobby(roomId);
    broadcastGame(roomId);
  });

  socket.on("disconnect", () => {
    clearTimeout(expirationTimer);
    eventRateLimiter.clear(socket.id);
    const userId = socket.data.userId;
    const roomId = socket.data.roomId;

    if (activeSocketByUser.get(userId) === socket.id) {
      activeSocketByUser.delete(userId);
      if (roomId && rooms.get(roomId)?.players.has(userId)) {
        clearPendingDisconnect(userId);
        const timer = setTimeout(() => {
          const pending = pendingDisconnects.get(userId);
          if (pending?.timer !== timer) return;

          pendingDisconnects.delete(userId);
          removePlayerFromRoom(roomId, userId);
        }, RECONNECT_GRACE_MS);
        timer.unref();
        pendingDisconnects.set(userId, { roomId, timer });
      }
    }

    console.log("Cliente Socket.IO desconectado.");
  });
});

let isShuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Shutting down RogueWeb Socket.IO server (${signal}).`);

  for (const { timer } of pendingDisconnects.values()) {
    clearTimeout(timer);
  }
  pendingDisconnects.clear();
  await new Promise<void>((resolve) => io.close(() => resolve()));
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

httpServer.listen(PORT, HOST, () => {
  console.log(
    `RogueWeb Socket.IO escuchando en http://${HOST}:${PORT}`
  );
});
