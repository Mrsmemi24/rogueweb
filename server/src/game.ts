import {
  generateDungeon,
  type Dungeon,
  type Position,
} from "./dungeon.js";
import { z } from "zod";

export type Direction = "up" | "down" | "left" | "right";
export type PlayerStatus = "alive" | "defeated";

export type EnemyStatus = "alive" | "defeated";

export type Player = {
  id: string;
  name: string;
  ready: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  enemiesDefeated: number;
  status: PlayerStatus;
};

export type Enemy = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  xpReward: number;
  status: EnemyStatus;
};

export type PublicPlayerState = Pick<
  Player,
  | "id"
  | "name"
  | "x"
  | "y"
  | "hp"
  | "maxHp"
  | "level"
  | "xp"
  | "enemiesDefeated"
  | "status"
>;

export type PublicEnemyState = Pick<
  Enemy,
  "id" | "name" | "x" | "y" | "hp" | "maxHp" | "status"
>;

export type PublicGameState = {
  roomId: string;
  seed: number;
  map: string[];
  exit: Position;
  players: PublicPlayerState[];
  enemies: PublicEnemyState[];
};

export type RoomState = {
  dungeon: Dungeon;
  players: Map<string, Player>;
  enemies: Enemy[];
};

const PLAYER_ATTACK = 18;
const PLAYER_DEFENSE = 3;
const ENEMY_LEVEL = 1;
const ENEMY_MAX_HP = 28 + ENEMY_LEVEL * 8;
const ENEMY_DAMAGE = 5 + ENEMY_LEVEL * 2;
const ENEMY_DEFENSE = Math.floor((ENEMY_LEVEL - 1) / 3);
const ENEMY_XP_REWARD = 50 + ENEMY_LEVEL * 25;
const MAX_ROOM_ENEMIES = 3;

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

export const AttackIntentSchema = z
  .object({
    direction: z.enum(["up", "down", "left", "right"]),
  })
  .strict();

export type MoveFailure =
  | "invalid-direction"
  | "player-not-found"
  | "defeated"
  | "outside-map"
  | "wall"
  | "occupied"
  | "enemy-occupied";

export type AttackFailure =
  | "invalid-direction"
  | "player-not-found"
  | "defeated"
  | "no-enemy";

export type MoveResult =
  | { ok: true }
  | { ok: false; reason: MoveFailure };

export type AttackResult =
  | { ok: true; damage: number; defeated: boolean }
  | { ok: false; reason: AttackFailure };

const DIRECTION_OFFSETS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function isDirection(direction: string): direction is Direction {
  return Object.hasOwn(DIRECTION_OFFSETS, direction);
}

function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createEnemies(dungeon: Dungeon): Enemy[] {
  const blockedPositions = new Set(
    [...dungeon.spawns, dungeon.exit].map(({ x, y }) => `${x},${y}`)
  );
  const candidates: Position[] = [];

  for (let y = 0; y < dungeon.map.length; y++) {
    for (let x = 0; x < dungeon.map[y].length; x++) {
      if (
        dungeon.map[y][x] === "." &&
        !blockedPositions.has(`${x},${y}`)
      ) {
        candidates.push({ x, y });
      }
    }
  }

  const random = createRandom(dungeon.seed ^ 0xa5a5a5a5);

  for (let index = candidates.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex],
      candidates[index],
    ];
  }

  const enemies: Enemy[] = [];

  for (const position of candidates) {
    if (enemies.length >= MAX_ROOM_ENEMIES) break;

    const tooClose = enemies.some(
      (enemy) =>
        Math.abs(enemy.x - position.x) +
          Math.abs(enemy.y - position.y) <
        3
    );

    if (tooClose) continue;

    enemies.push({
      id: `sentinel-${enemies.length + 1}`,
      name: `Centinela nivel ${ENEMY_LEVEL}`,
      ...position,
      hp: ENEMY_MAX_HP,
      maxHp: ENEMY_MAX_HP,
      damage: ENEMY_DAMAGE,
      defense: ENEMY_DEFENSE,
      xpReward: ENEMY_XP_REWARD,
      status: "alive",
    });
  }

  return enemies;
}

export function createRoomState(seed: number): RoomState {
  const dungeon = generateDungeon(seed);

  return {
    dungeon,
    players: new Map<string, Player>(),
    enemies: createEnemies(dungeon),
  };
}

export function createPlayer(
  id: string,
  name: string,
  position: Position
): Player {
  return {
    id,
    name,
    ready: false,
    ...position,
    hp: 100,
    maxHp: 100,
    attack: PLAYER_ATTACK,
    defense: PLAYER_DEFENSE,
    level: 1,
    xp: 0,
    enemiesDefeated: 0,
    status: "alive",
  };
}

export function updatePlayerHealth(
  room: RoomState,
  playerId: string,
  requestedHp: number
): boolean {
  const player = room.players.get(playerId);

  if (!player || !Number.isFinite(requestedHp)) {
    return false;
  }

  player.hp = Math.max(0, Math.min(player.maxHp, Math.floor(requestedHp)));
  player.status = player.hp === 0 ? "defeated" : "alive";
  return true;
}

export function toPublicPlayerState(
  player: Player
): PublicPlayerState {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    hp: player.hp,
    maxHp: player.maxHp,
    level: player.level,
    xp: player.xp,
    enemiesDefeated: player.enemiesDefeated,
    status: player.status,
  };
}

export function toPublicGameState(
  roomId: string,
  room: RoomState
): PublicGameState {
  return {
    roomId,
    seed: room.dungeon.seed,
    map: [...room.dungeon.map],
    exit: { ...room.dungeon.exit },
    players: Array.from(room.players.values(), toPublicPlayerState),
    enemies: room.enemies.map(toPublicEnemyState),
  };
}

export function toPublicEnemyState(enemy: Enemy): PublicEnemyState {
  return {
    id: enemy.id,
    name: enemy.name,
    x: enemy.x,
    y: enemy.y,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    status: enemy.status,
  };
}

export function getOrCreateRoom(
  rooms: Map<string, RoomState>,
  roomId: string,
  seed: number
): RoomState {
  const existingRoom = rooms.get(roomId);

  if (existingRoom) {
    return existingRoom;
  }

  const room = createRoomState(seed);
  rooms.set(roomId, room);
  return room;
}

export function findAvailableSpawn(
  room: RoomState
): Position | undefined {
  return room.dungeon.spawns.find(
    (spawn) =>
      !Array.from(room.players.values()).some(
        (player) => player.x === spawn.x && player.y === spawn.y
      )
  );
}

export function tryMovePlayer(
  room: RoomState,
  playerId: string,
  direction: string
): MoveResult {
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

  if (
    nextY < 0 ||
    nextY >= room.dungeon.map.length ||
    nextX < 0 ||
    nextX >= (room.dungeon.map[nextY]?.length ?? 0)
  ) {
    return { ok: false, reason: "outside-map" };
  }

  if (room.dungeon.map[nextY][nextX] !== ".") {
    return { ok: false, reason: "wall" };
  }

  const occupied = Array.from(room.players.values()).some(
    (other) =>
      other.id !== player.id &&
      other.x === nextX &&
      other.y === nextY
  );

  if (occupied) {
    return { ok: false, reason: "occupied" };
  }

  const enemyOccupied = room.enemies.some(
    (enemy) =>
      enemy.status === "alive" &&
      enemy.x === nextX &&
      enemy.y === nextY
  );

  if (enemyOccupied) {
    return { ok: false, reason: "enemy-occupied" };
  }

  player.x = nextX;
  player.y = nextY;
  return { ok: true };
}

export function tryAttackPlayer(
  room: RoomState,
  playerId: string,
  direction: string
): AttackResult {
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
  const targetX = player.x + offset.x;
  const targetY = player.y + offset.y;
  const enemy = room.enemies.find(
    (candidate) =>
      candidate.status === "alive" &&
      candidate.x === targetX &&
      candidate.y === targetY
  );

  if (!enemy) {
    return { ok: false, reason: "no-enemy" };
  }

  const damage = Math.max(1, player.attack - enemy.defense);
  enemy.hp = Math.max(0, enemy.hp - damage);
  const defeated = enemy.hp === 0;
  enemy.status = defeated ? "defeated" : "alive";

  if (defeated) {
    player.xp += enemy.xpReward;
    player.enemiesDefeated += 1;
  }

  return { ok: true, damage, defeated };
}
