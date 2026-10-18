import {
  generateDungeon,
  type Dungeon,
  type Position,
} from "./dungeon.js";
import { z } from "zod";

export type Direction = "up" | "down" | "left" | "right";
export type PlayerStatus = "alive" | "defeated";

export type EnemyStatus = "alive" | "defeated";
export type GameStatus = "active" | "victory" | "defeat";

export type Player = {
  id: string;
  userId?: string;
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
  inventory?: string[];
  status: PlayerStatus;
  lastMoveAt?: number;
  lastAttackAt?: number;
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
  matchId?: string;
  hostPlayerId?: string;
  seed: number;
  map: string[];
  exit: Position;
  players: PublicPlayerState[];
  enemies: PublicEnemyState[];
  status: GameStatus;
};

export type RoomState = {
  dungeon: Dungeon;
  players: Map<string, Player>;
  enemies: Enemy[];
  status: GameStatus;
  hostUserId?: string;
  matchId?: string;
  startedAt?: number;
  persistenceState?: "pending" | "saved" | "failed";
};

const PLAYER_ATTACK = 18;
const PLAYER_DEFENSE = 3;
const ENEMY_LEVEL = 1;
const ENEMY_MAX_HP = 28 + ENEMY_LEVEL * 8;
const ENEMY_DAMAGE = 5 + ENEMY_LEVEL * 2;
const ENEMY_DEFENSE = Math.floor((ENEMY_LEVEL - 1) / 3);
const ENEMY_XP_REWARD = 50 + ENEMY_LEVEL * 25;
const MAX_ROOM_ENEMIES = 3;
const ATTACK_COOLDOWN_MS = 250;
const MOVE_COOLDOWN_MS = 150;
const XP_FOR_FIRST_LEVEL = 100;
const LEVEL_HP_BONUS = 15;
const LEVEL_ATTACK_BONUS = 3;

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
  | "game-over"
  | "cooldown"
  | "outside-map"
  | "wall"
  | "occupied"
  | "enemy-occupied";

export type AttackFailure =
  | "invalid-direction"
  | "player-not-found"
  | "defeated"
  | "game-over"
  | "cooldown"
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
    status: "active",
  };
}

export function restartRoomState(room: RoomState, seed: number) {
  const fresh = createRoomState(seed);
  const players = new Map<string, Player>();

  for (const [key, previousPlayer] of room.players) {
    const spawn = findAvailableSpawn({
      ...fresh,
      players,
    });

    if (!spawn) {
      throw new Error("The new dungeon has no available player spawn");
    }

    const player = createPlayer(
      previousPlayer.id,
      previousPlayer.name,
      spawn,
      previousPlayer.userId
    );
    players.set(previousPlayer.userId ?? key, player);
  }

  room.dungeon = fresh.dungeon;
  room.players = players;
  room.enemies = fresh.enemies;
  room.status = "active";
  room.matchId = undefined;
  room.startedAt = undefined;
  room.persistenceState = undefined;
}

export function createPlayer(
  id: string,
  name: string,
  position: Position,
  userId?: string
): Player {
  return {
    id,
    ...(userId ? { userId, inventory: [] } : {}),
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
    ...(room.matchId ? { matchId: room.matchId } : {}),
    ...(room.hostUserId && room.players.has(room.hostUserId)
      ? { hostPlayerId: room.players.get(room.hostUserId)?.id }
      : {}),
    seed: room.dungeon.seed,
    map: [...room.dungeon.map],
    exit: { ...room.dungeon.exit },
    players: Array.from(room.players.values(), toPublicPlayerState),
    enemies: room.enemies.map(toPublicEnemyState),
    status: room.status,
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
  direction: string,
  now = Date.now()
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

  if (room.status !== "active") {
    return { ok: false, reason: "game-over" };
  }

  if (
    player.lastMoveAt !== undefined &&
    now - player.lastMoveAt < MOVE_COOLDOWN_MS
  ) {
    return { ok: false, reason: "cooldown" };
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
  player.lastMoveAt = now;
  if (nextX === room.dungeon.exit.x && nextY === room.dungeon.exit.y) {
    room.status = "victory";
  } else {
    advanceEnemies(room);
  }
  return { ok: true };
}

export function tryAttackPlayer(
  room: RoomState,
  playerId: string,
  direction: string,
  now = Date.now()
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

  if (room.status !== "active") {
    return { ok: false, reason: "game-over" };
  }

  if (
    player.lastAttackAt !== undefined &&
    now - player.lastAttackAt < ATTACK_COOLDOWN_MS
  ) {
    return { ok: false, reason: "cooldown" };
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
  player.lastAttackAt = now;
  enemy.hp = Math.max(0, enemy.hp - damage);
  const defeated = enemy.hp === 0;
  enemy.status = defeated ? "defeated" : "alive";

  if (defeated) {
    grantExperience(player, enemy.xpReward);
    player.enemiesDefeated += 1;
  }

  advanceEnemies(room);
  return { ok: true, damage, defeated };
}

function grantExperience(player: Player, amount: number) {
  player.xp += Math.max(0, Math.floor(amount));

  while (player.xp >= player.level * XP_FOR_FIRST_LEVEL) {
    player.level += 1;
    player.maxHp += LEVEL_HP_BONUS;
    player.hp = player.maxHp;
    player.attack += LEVEL_ATTACK_BONUS;

    if (player.level % 2 === 0) {
      player.defense += 1;
    }
  }
}

function findEnemyStep(
  room: RoomState,
  enemy: Enemy,
  target: Player
): Position | undefined {
  const queue: Array<Position & { firstStep?: Position }> = [
    { x: enemy.x, y: enemy.y },
  ];
  const visited = new Set([`${enemy.x},${enemy.y}`]);
  const directions: Direction[] = ["up", "down", "left", "right"];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];

    if (
      Math.abs(current.x - target.x) +
        Math.abs(current.y - target.y) ===
      1
    ) {
      return current.firstStep;
    }

    for (const direction of directions) {
      const offset = DIRECTION_OFFSETS[direction];
      const x = current.x + offset.x;
      const y = current.y + offset.y;
      const key = `${x},${y}`;

      if (
        visited.has(key) ||
        room.dungeon.map[y]?.[x] !== "." ||
        Array.from(room.players.values()).some(
          (player) => player.id !== target.id && player.x === x && player.y === y
        ) ||
        room.enemies.some(
          (other) =>
            other !== enemy &&
            other.status === "alive" &&
            other.x === x &&
            other.y === y
        )
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        x,
        y,
        firstStep: current.firstStep ?? { x, y },
      });
    }
  }

  return undefined;
}

export function advanceEnemies(room: RoomState) {
  if (room.status !== "active") return;

  for (const enemy of room.enemies) {
    if (enemy.status !== "alive") continue;

    const target = Array.from(room.players.values())
      .filter((player) => player.status === "alive")
      .sort(
        (first, second) =>
          Math.abs(first.x - enemy.x) +
            Math.abs(first.y - enemy.y) -
          (Math.abs(second.x - enemy.x) +
            Math.abs(second.y - enemy.y))
      )[0];

    if (!target) continue;

    const distance =
      Math.abs(target.x - enemy.x) + Math.abs(target.y - enemy.y);

    if (distance === 1) {
      const damage = Math.max(1, enemy.damage - target.defense);
      target.hp = Math.max(0, target.hp - damage);
      target.status = target.hp === 0 ? "defeated" : "alive";
      continue;
    }

    const next = findEnemyStep(room, enemy, target);
    if (next) {
      enemy.x = next.x;
      enemy.y = next.y;
    }
  }

  if (
    room.players.size > 0 &&
    Array.from(room.players.values()).every(
      (player) => player.status === "defeated"
    )
  ) {
    room.status = "defeat";
  }
}
