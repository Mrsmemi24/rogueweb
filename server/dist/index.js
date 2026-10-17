import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
// Tablero de prueba compartido por todos los clientes.
const GAME_MAP = [
    "#########",
    "#.......#",
    "#..#....#",
    "#..#.#..#",
    "#.......#",
    "#...#...#",
    "#########",
];
const SPAWNS = [
    { x: 1, y: 1 },
    { x: 7, y: 1 },
    { x: 1, y: 5 },
    { x: 7, y: 5 },
];
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
const MoveSchema = z
    .object({
    direction: z.enum(["up", "down", "left", "right"]),
})
    .strict();
const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, {
            "Content-Type": "application/json",
        });
        response.end(JSON.stringify({
            ok: true,
            service: "rogueweb-socket-server",
        }));
        return;
    }
    response.writeHead(404, {
        "Content-Type": "application/json",
    });
    response.end(JSON.stringify({ error: "Not found" }));
});
const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGIN,
        methods: ["GET", "POST"],
    },
});
const rooms = new Map();
function broadcastLobby(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    io.to(roomId).emit("lobby:state", {
        roomId,
        players: Array.from(room.values()),
    });
}
function broadcastGame(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    const players = Array.from(room.values()).map(({ id, name, x, y }) => ({
        id,
        name,
        x,
        y,
    }));
    io.to(roomId).emit("game:state", {
        roomId,
        map: [...GAME_MAP],
        players,
    });
}
function removePlayerFromRoom(roomId, socketId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    room.delete(socketId);
    if (room.size === 0) {
        rooms.delete(roomId);
        return;
    }
    broadcastLobby(roomId);
    broadcastGame(roomId);
}
io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    socket.on("lobby:join", (payload) => {
        const result = JoinRoomSchema.safeParse(payload);
        if (!result.success) {
            socket.emit("app:error", {
                message: "Nombre o identificador de sala inválido.",
            });
            return;
        }
        const { roomId, playerName } = result.data;
        const previousRoom = socket.data.roomId;
        // Entrar de nuevo a la misma sala no debe duplicar al jugador.
        if (previousRoom === roomId) {
            const existing = rooms.get(roomId)?.get(socket.id);
            if (existing) {
                existing.name = playerName;
                broadcastLobby(roomId);
                broadcastGame(roomId);
                return;
            }
        }
        const targetRoom = rooms.get(roomId);
        // Hay cuatro posiciones de aparición disponibles.
        if (targetRoom && targetRoom.size >= SPAWNS.length) {
            socket.emit("app:error", {
                message: "La sala está llena. El máximo es de cuatro jugadores.",
            });
            return;
        }
        // Solo abandonamos la sala anterior si la nueva es válida.
        if (previousRoom) {
            removePlayerFromRoom(previousRoom, socket.id);
            void socket.leave(previousRoom);
        }
        let room = rooms.get(roomId);
        if (!room) {
            room = new Map();
            rooms.set(roomId, room);
        }
        const spawn = SPAWNS.find((position) => !Array.from(room.values()).some((player) => player.x === position.x && player.y === position.y));
        if (!spawn) {
            socket.emit("app:error", {
                message: "No quedan posiciones de aparición libres.",
            });
            return;
        }
        room.set(socket.id, {
            id: socket.id,
            name: playerName,
            ready: false,
            x: spawn.x,
            y: spawn.y,
        });
        socket.data.roomId = roomId;
        void socket.join(roomId);
        broadcastLobby(roomId);
        broadcastGame(roomId);
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
        const room = roomId ? rooms.get(roomId) : undefined;
        const player = room?.get(socket.id);
        if (!roomId || !room || !player) {
            socket.emit("app:error", {
                message: "Primero debes entrar en una sala.",
            });
            return;
        }
        player.ready = result.data.ready;
        broadcastLobby(roomId);
    });
    socket.on("game:move", (payload) => {
        // Nunca confiamos en coordenadas enviadas por el navegador.
        const result = MoveSchema.safeParse(payload);
        if (!result.success) {
            socket.emit("app:error", {
                message: "Movimiento inválido.",
            });
            return;
        }
        const roomId = socket.data.roomId;
        const room = roomId ? rooms.get(roomId) : undefined;
        const player = room?.get(socket.id);
        if (!roomId || !room || !player) {
            socket.emit("app:error", {
                message: "Debes entrar en una sala antes de moverte.",
            });
            return;
        }
        const offsets = {
            up: { dx: 0, dy: -1 },
            down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 },
            right: { dx: 1, dy: 0 },
        };
        const { dx, dy } = offsets[result.data.direction];
        const nextX = player.x + dx;
        const nextY = player.y + dy;
        // El servidor comprueba los límites del mapa.
        if (nextY < 0 ||
            nextY >= GAME_MAP.length ||
            nextX < 0 ||
            nextX >= GAME_MAP[0].length) {
            socket.emit("app:error", {
                message: "No puedes salir del tablero.",
            });
            return;
        }
        // El símbolo # representa una pared.
        if (GAME_MAP[nextY][nextX] !== ".") {
            socket.emit("app:error", {
                message: "Movimiento bloqueado por una pared.",
            });
            return;
        }
        // Evitamos que dos jugadores ocupen la misma casilla.
        const occupied = Array.from(room.values()).some((other) => other.id !== player.id &&
            other.x === nextX &&
            other.y === nextY);
        if (occupied) {
            socket.emit("app:error", {
                message: "Esa casilla ya está ocupada.",
            });
            return;
        }
        // El cliente solicita una dirección; el servidor calcula
        // y actualiza la posición real.
        player.x = nextX;
        player.y = nextY;
        // Todos los jugadores reciben el estado autorizado.
        broadcastGame(roomId);
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
    console.log(`RogueWeb Socket.IO escuchando en http://localhost:${PORT}`);
});
