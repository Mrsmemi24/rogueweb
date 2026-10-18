import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { Server } from "socket.io";
import { z } from "zod";
import { createPlayer, AttackIntentSchema, findAvailableSpawn, getOrCreateRoom, JoinRoomSchema, MoveIntentSchema, toPublicGameState, tryAttackPlayer, tryMovePlayer, } from "./game.js";
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}
const ReadySchema = z
    .object({
    ready: z.boolean(),
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
        origin: (origin, callback) => {
            const isLocalOrigin = origin === undefined ||
                /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
            if (isLocalOrigin || origin === CLIENT_ORIGIN) {
                callback(null, true);
                return;
            }
            callback(new Error(`Origin not allowed: ${origin}`));
        },
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
        players: Array.from(room.players.values(), (player) => ({
            id: player.id,
            name: player.name,
            ready: player.ready,
            x: player.x,
            y: player.y,
        })),
    });
}
function broadcastGame(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    const state = toPublicGameState(roomId, room);
    io.to(roomId).emit("game:state", state);
}
function removePlayerFromRoom(roomId, socketId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    room.players.delete(socketId);
    if (room.players.size === 0) {
        rooms.delete(roomId);
        return;
    }
    broadcastLobby(roomId);
    broadcastGame(roomId);
}
io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    socket.on("lobby:join", async (payload) => {
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
            const existing = rooms.get(roomId)?.players.get(socket.id);
            if (existing) {
                existing.name = playerName;
                broadcastLobby(roomId);
                broadcastGame(roomId);
                return;
            }
        }
        const targetRoom = rooms.get(roomId);
        if (targetRoom &&
            targetRoom.players.size >= targetRoom.dungeon.spawns.length) {
            socket.emit("app:error", {
                message: "La sala está llena. El máximo es de cuatro jugadores.",
            });
            return;
        }
        const room = targetRoom ??
            getOrCreateRoom(rooms, roomId, randomInt(0, 0x1_0000_0000));
        const spawn = findAvailableSpawn(room);
        if (!spawn) {
            if (room.players.size === 0) {
                rooms.delete(roomId);
            }
            socket.emit("app:error", {
                message: "No quedan posiciones de aparición libres.",
            });
            return;
        }
        // Solo abandonamos la sala anterior si la nueva es válida.
        if (previousRoom) {
            removePlayerFromRoom(previousRoom, socket.id);
            await socket.leave(previousRoom);
        }
        room.players.set(socket.id, createPlayer(socket.id, playerName, spawn));
        socket.data.roomId = roomId;
        await socket.join(roomId);
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
        const player = room?.players.get(socket.id);
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
        const result = MoveIntentSchema.safeParse(payload);
        if (!result.success) {
            socket.emit("app:error", {
                message: "Movimiento inválido.",
            });
            return;
        }
        const roomId = socket.data.roomId;
        const room = roomId ? rooms.get(roomId) : undefined;
        if (!roomId || !room) {
            socket.emit("app:error", {
                message: "Debes entrar en una sala antes de moverte.",
            });
            return;
        }
        const moveResult = tryMovePlayer(room, socket.id, result.data.direction);
        if (!moveResult.ok) {
            const errorMessages = {
                "invalid-direction": "Movimiento inválido.",
                "player-not-found": "No se encontró al jugador en la sala.",
                defeated: "Un jugador derrotado no puede moverse.",
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
        if (!roomId || !room) {
            socket.emit("app:error", {
                message: "Debes entrar en una sala antes de atacar.",
            });
            return;
        }
        const attackResult = tryAttackPlayer(room, socket.id, result.data.direction);
        if (!attackResult.ok) {
            const errorMessages = {
                "invalid-direction": "Dirección de ataque inválida.",
                "player-not-found": "No se encontró al jugador en la sala.",
                defeated: "Un jugador derrotado no puede atacar.",
                cooldown: "Debes esperar antes de volver a atacar.",
                "no-enemy": "No hay un centinela en esa dirección.",
            };
            socket.emit("app:error", {
                message: errorMessages[attackResult.reason],
            });
            return;
        }
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
httpServer.listen(PORT, HOST, () => {
    console.log(`RogueWeb Socket.IO escuchando en http://${HOST}:${PORT}`);
});
