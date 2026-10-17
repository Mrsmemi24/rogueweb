import { generateDungeon, } from "./dungeon.js";
import { z } from "zod";
export const JoinRoomSchema = z
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
export const MoveIntentSchema = z
    .object({
    direction: z.enum(["up", "down", "left", "right"]),
})
    .strict();
const DIRECTION_OFFSETS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};
function isDirection(direction) {
    return Object.hasOwn(DIRECTION_OFFSETS, direction);
}
export function createRoomState(seed) {
    return {
        dungeon: generateDungeon(seed),
        players: new Map(),
    };
}
export function createPlayer(id, name, position) {
    return {
        id,
        name,
        ready: false,
        ...position,
        hp: 100,
        maxHp: 100,
        level: 1,
        xp: 0,
        status: "alive",
    };
}
export function updatePlayerHealth(room, playerId, requestedHp) {
    const player = room.players.get(playerId);
    if (!player || !Number.isFinite(requestedHp)) {
        return false;
    }
    player.hp = Math.max(0, Math.min(player.maxHp, Math.floor(requestedHp)));
    player.status = player.hp === 0 ? "defeated" : "alive";
    return true;
}
export function toPublicPlayerState(player) {
    return {
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        level: player.level,
        xp: player.xp,
        status: player.status,
    };
}
export function toPublicGameState(roomId, room) {
    return {
        roomId,
        seed: room.dungeon.seed,
        map: [...room.dungeon.map],
        exit: { ...room.dungeon.exit },
        players: Array.from(room.players.values(), toPublicPlayerState),
    };
}
export function getOrCreateRoom(rooms, roomId, seed) {
    const existingRoom = rooms.get(roomId);
    if (existingRoom) {
        return existingRoom;
    }
    const room = createRoomState(seed);
    rooms.set(roomId, room);
    return room;
}
export function findAvailableSpawn(room) {
    return room.dungeon.spawns.find((spawn) => !Array.from(room.players.values()).some((player) => player.x === spawn.x && player.y === spawn.y));
}
export function tryMovePlayer(room, playerId, direction) {
    if (!isDirection(direction)) {
        return { ok: false, reason: "invalid-direction" };
    }
    const player = room.players.get(playerId);
    if (!player) {
        return { ok: false, reason: "player-not-found" };
    }
    if (player.status === "defeated") {
        return { ok: false, reason: "defeated" };
    }
    const offset = DIRECTION_OFFSETS[direction];
    const nextX = player.x + offset.x;
    const nextY = player.y + offset.y;
    if (nextY < 0 ||
        nextY >= room.dungeon.map.length ||
        nextX < 0 ||
        nextX >= (room.dungeon.map[nextY]?.length ?? 0)) {
        return { ok: false, reason: "outside-map" };
    }
    if (room.dungeon.map[nextY][nextX] !== ".") {
        return { ok: false, reason: "wall" };
    }
    const occupied = Array.from(room.players.values()).some((other) => other.id !== player.id &&
        other.x === nextX &&
        other.y === nextY);
    if (occupied) {
        return { ok: false, reason: "occupied" };
    }
    player.x = nextX;
    player.y = nextY;
    return { ok: true };
}
