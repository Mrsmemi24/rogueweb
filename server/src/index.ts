
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_ORIGIN =
  process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

// Validamos los datos que llegan desde el navegador.
const JoinRoomSchema = z
  .object({
    roomId: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .transform((value) => value.toLowerCase()),

    playerName: z.string().trim().min(1).max(20),
  })
  .strict();

const ReadySchema = z
  .object({
    ready: z.boolean(),
  })
  .strict();

type Player = {
  id: string;
  name: string;
  ready: boolean;
};

type LobbyState = {
  roomId: string;
  players: Player[];
};

interface ClientToServerEvents {
  "lobby:join": (payload: unknown) => void;
  "lobby:ready": (payload: unknown) => void;
}

interface ServerToClientEvents {
  "lobby:state": (state: LobbyState) => void;
  "app:error": (payload: { message: string }) => void;
}

interface InterServerEvents {}

interface SocketData {
  roomId?: string;
}

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
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
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// Las salas y sus jugadores viven en memoria durante esta fase.
const rooms = new Map<string, Map<string, Player>>();

function broadcastLobby(roomId: string) {
  const room = rooms.get(roomId);

  if (!room) return;

  const state: LobbyState = {
    roomId,
    players: Array.from(room.values()),
  };

  io.to(roomId).emit("lobby:state", state);
}

function removePlayerFromRoom(
  roomId: string,
  socketId: string
) {
  const room = rooms.get(roomId);

  if (!room) return;

  room.delete(socketId);

  if (room.size === 0) {
    rooms.delete(roomId);
    return;
  }

  broadcastLobby(roomId);
}

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.on("lobby:join", (payload) => {
    const result = JoinRoomSchema.safeParse(payload);

    if (!result.success) {
      socket.emit("app:error", {
        message:
          "Datos inválidos. Revisa el nombre y el identificador de la sala.",
      });
      return;
    }

    const { roomId, playerName } = result.data;

    // Un jugador solo puede pertenecer a una sala a la vez.
    const previousRoom = socket.data.roomId;

    if (previousRoom) {
      removePlayerFromRoom(previousRoom, socket.id);
      void socket.leave(previousRoom);
    }

    let room = rooms.get(roomId);

    if (!room) {
      room = new Map<string, Player>();
      rooms.set(roomId, room);
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      ready: false,
    };

    room.set(socket.id, player);
    socket.data.roomId = roomId;

    void socket.join(roomId);

    broadcastLobby(roomId);

    console.log(`${playerName} entró en la sala ${roomId}`);
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

    if (!roomId) {
      socket.emit("app:error", {
        message: "Primero debes entrar en una sala.",
      });
      return;
    }

    const room = rooms.get(roomId);
    const player = room?.get(socket.id);

    if (!room || !player) {
      socket.emit("app:error", {
        message: "No se encontró al jugador en la sala.",
      });
      return;
    }

    // El servidor actualiza el estado y después lo comunica.
    player.ready = result.data.ready;

    broadcastLobby(roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId) {
      removePlayerFromRoom(roomId, socket.id);
    }

    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(
    `RogueWeb Socket.IO escuchando en http://localhost:${PORT}`
  );
});
