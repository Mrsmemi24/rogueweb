import { describe, expect, it } from "vitest";
import {
  AttackIntentSchema,
  createPlayer,
  createRoomState,
  findAvailableSpawn,
  getOrCreateRoom,
  JoinRoomSchema,
  MoveIntentSchema,
  toPublicGameState,
  toPublicPlayerState,
  tryAttackPlayer,
  tryMovePlayer,
  updatePlayerHealth,
  type RoomState,
} from "./game.js";

function createRoom(seed = 42): RoomState {
  return {
    dungeon: {
      seed,
      map: ["#####", "#...#", "#####"],
      exit: { x: 3, y: 1 },
      spawns: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    },
    players: new Map(),
    enemies: [],
  };
}

function addEnemy(room: RoomState, id = "sentinel-test") {
  const enemy = {
    id,
    name: "Centinela nivel 1",
    x: 2,
    y: 1,
    hp: 36,
    maxHp: 36,
    damage: 7,
    defense: 0,
    xpReward: 75,
    status: "alive" as const,
  };

  room.enemies.push(enemy);
  return enemy;
}

describe("authoritative multiplayer room state", () => {
  it("creates players with the single-player baseline stats", () => {
    expect(createPlayer("p1", "One", { x: 1, y: 1 })).toEqual({
      id: "p1",
      name: "One",
      ready: false,
      x: 1,
      y: 1,
      hp: 100,
      maxHp: 100,
      attack: 18,
      defense: 3,
      level: 1,
      xp: 0,
      enemiesDefeated: 0,
      status: "alive",
    });
  });

  it("clamps server-updated health to the player's maximum", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    room.players.set(player.id, player);

    expect(updatePlayerHealth(room, player.id, 125)).toBe(true);
    expect(player.hp).toBe(player.maxHp);
    expect(player.status).toBe("alive");

    expect(updatePlayerHealth(room, player.id, -10)).toBe(true);
    expect(player.hp).toBe(0);
    expect(player.status).toBe("defeated");
  });

  it("rejects client payloads that attempt to set player stats", () => {
    expect(
      JoinRoomSchema.safeParse({
        roomId: "alpha",
        playerName: "One",
        hp: 1,
        level: 99,
        xp: 5000,
        status: "defeated",
      }).success
    ).toBe(false);

    expect(
      MoveIntentSchema.safeParse({
        direction: "right",
        hp: 1,
        level: 99,
        xp: 5000,
        status: "defeated",
        x: 100,
        y: 100,
      }).success
    ).toBe(false);
  });

  it("serializes public player stats without lobby or server-only fields", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    room.players.set(player.id, player);

    expect(toPublicPlayerState(player)).toEqual({
      id: "p1",
      name: "One",
      x: 1,
      y: 1,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      enemiesDefeated: 0,
      status: "alive",
    });
    expect(toPublicGameState("alpha", room)).toEqual({
      roomId: "alpha",
      seed: 42,
      map: ["#####", "#...#", "#####"],
      exit: { x: 3, y: 1 },
      players: [
        {
          id: "p1",
          name: "One",
          x: 1,
          y: 1,
          hp: 100,
          maxHp: 100,
          level: 1,
          xp: 0,
          enemiesDefeated: 0,
          status: "alive",
        },
      ],
      enemies: [],
    });
  });

  it("reuses one dungeon for players in a room and isolates other rooms", () => {
    const rooms = new Map<string, RoomState>();
    const firstJoin = getOrCreateRoom(rooms, "alpha", 42);
    const secondJoin = getOrCreateRoom(rooms, "alpha", 99);
    const otherRoom = getOrCreateRoom(rooms, "beta", 99);

    expect(secondJoin).toBe(firstJoin);
    expect(secondJoin.dungeon).toBe(firstJoin.dungeon);
    expect(otherRoom).not.toBe(firstJoin);
    expect(otherRoom.dungeon.seed).toBe(99);
    expect(otherRoom.dungeon.map).not.toEqual(firstJoin.dungeon.map);
  });

  it("allocates only walkable and unoccupied spawn positions", () => {
    const room = createRoom();
    const firstSpawn = findAvailableSpawn(room);

    expect(firstSpawn).toEqual({ x: 1, y: 1 });
    if (!firstSpawn) {
      throw new Error("The test room must provide a spawn.");
    }

    room.players.set("p1", createPlayer("p1", "One", firstSpawn));
    expect(findAvailableSpawn(room)).toEqual({ x: 2, y: 1 });
    room.players.set("p2", createPlayer("p2", "Two", { x: 2, y: 1 }));
    expect(findAvailableSpawn(room)).toBeUndefined();
  });

  it("creates deterministic enemies on free walkable dungeon tiles", () => {
    const first = createRoomState(42);
    const second = createRoomState(42);
    const excluded = new Set(
      [
        ...first.dungeon.spawns,
        first.dungeon.exit,
      ].map(({ x, y }) => `${x},${y}`)
    );
    const enemyPositions = new Set<string>();

    expect(first.enemies).toHaveLength(3);
    expect(first.enemies).toEqual(second.enemies);

    for (const enemy of first.enemies) {
      const position = `${enemy.x},${enemy.y}`;

      expect(first.dungeon.map[enemy.y][enemy.x]).toBe(".");
      expect(excluded.has(position)).toBe(false);
      expect(enemyPositions.has(position)).toBe(false);
      expect(enemy).toMatchObject({
        hp: 36,
        maxHp: 36,
        damage: 7,
        defense: 0,
        xpReward: 75,
        status: "alive",
      });
      enemyPositions.add(position);
    }
  });

  it("spawns room enemies independently from players and other enemies", () => {
    const room = createRoomState(84);
    const spawn = room.dungeon.spawns[0];
    const player = createPlayer("p1", "One", spawn);
    room.players.set(player.id, player);

    expect(
      room.enemies.some(
        (enemy) => enemy.x === player.x && enemy.y === player.y
      )
    ).toBe(false);
    expect(
      new Set(room.enemies.map(({ x, y }) => `${x},${y}`)).size
    ).toBe(room.enemies.length);
  });

  it("damages only an adjacent enemy in the requested direction", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    const enemy = addEnemy(room);
    room.players.set(player.id, player);

    expect(tryAttackPlayer(room, player.id, "right")).toEqual({
      ok: true,
      damage: 18,
      defeated: false,
    });
    expect(enemy.hp).toBe(18);
  });

  it("rejects attacks from a distance and invalid directions", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    const enemy = addEnemy(room);
    enemy.x = 3;
    room.players.set(player.id, player);

    expect(tryAttackPlayer(room, player.id, "right")).toEqual({
      ok: false,
      reason: "no-enemy",
    });
    expect(tryAttackPlayer(room, player.id, "teleport")).toEqual({
      ok: false,
      reason: "invalid-direction",
    });
    expect(enemy.hp).toBe(36);
  });

  it("rejects attacks from defeated or missing players", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    addEnemy(room);
    room.players.set(player.id, player);
    updatePlayerHealth(room, player.id, 0);

    expect(tryAttackPlayer(room, player.id, "right")).toEqual({
      ok: false,
      reason: "defeated",
    });
    expect(tryAttackPlayer(room, "absent", "right")).toEqual({
      ok: false,
      reason: "player-not-found",
    });
  });

  it("clamps enemy HP and awards XP and kills once when defeated", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    const enemy = addEnemy(room);
    room.players.set(player.id, player);
    player.attack = 1000;

    expect(tryAttackPlayer(room, player.id, "right")).toEqual({
      ok: true,
      damage: 1000,
      defeated: true,
    });
    expect(enemy).toMatchObject({ hp: 0, status: "defeated" });
    expect(player).toMatchObject({ xp: 75, enemiesDefeated: 1 });

    expect(tryAttackPlayer(room, player.id, "right")).toEqual({
      ok: false,
      reason: "no-enemy",
    });
    expect(enemy.hp).toBe(0);
    expect(player).toMatchObject({ xp: 75, enemiesDefeated: 1 });
  });

  it("rejects client-provided damage, target HP, and arbitrary targets", () => {
    expect(AttackIntentSchema.safeParse({ direction: "right" }).success).toBe(
      true
    );
    expect(
      AttackIntentSchema.safeParse({
        direction: "right",
        damage: 999999,
      }).success
    ).toBe(false);
    expect(
      AttackIntentSchema.safeParse({
        direction: "right",
        targetHp: 0,
        targetId: "sentinel-test",
      }).success
    ).toBe(false);

    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    const enemy = addEnemy(room);
    room.players.set(player.id, player);

    expect(tryAttackPlayer(room, player.id, "right")).toMatchObject({
      ok: true,
      damage: 18,
    });
    expect(enemy.hp).toBe(18);
  });

  it("serializes enemy combat state without server-only combat values", () => {
    const room = createRoom();
    addEnemy(room);
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    room.players.set(player.id, player);

    expect(toPublicGameState("alpha", room).enemies).toEqual([
      {
        id: "sentinel-test",
        name: "Centinela nivel 1",
        x: 2,
        y: 1,
        hp: 36,
        maxHp: 36,
        status: "alive",
      },
    ]);
    expect(toPublicGameState("alpha", room).enemies[0]).not.toHaveProperty(
      "damage"
    );
    expect(toPublicGameState("alpha", room).enemies[0]).not.toHaveProperty(
      "xpReward"
    );
  });

  it("moves a player one valid step and mutates only server state", () => {
    const room = createRoom();
    room.players.set("p1", createPlayer("p1", "One", { x: 1, y: 1 }));

    expect(tryMovePlayer(room, "p1", "right")).toEqual({ ok: true });
    expect(room.players.get("p1")).toMatchObject({ x: 2, y: 1 });
  });

  it.each([
    ["wall", { x: 1, y: 1 }, "up"],
    ["map boundary", { x: 0, y: 1 }, "left"],
    ["occupied tile", { x: 1, y: 1 }, "right"],
  ] as const)("rejects movement into a %s without changing position", (
    _case,
    position,
    direction
  ) => {
    const room = createRoom();
    room.players.set("p1", createPlayer("p1", "One", position));

    if (direction === "right") {
      room.players.set("p2", createPlayer("p2", "Two", { x: 2, y: 1 }));
    }

    expect(tryMovePlayer(room, "p1", direction)).toMatchObject({
      ok: false,
    });
    expect(room.players.get("p1")).toMatchObject(position);
  });

  it("rejects invalid directions and missing players", () => {
    const room = createRoom();

    room.players.set("p1", createPlayer("p1", "One", { x: 1, y: 1 }));

    expect(tryMovePlayer(room, "absent", "right")).toEqual({
      ok: false,
      reason: "player-not-found",
    });
    expect(tryMovePlayer(room, "p1", "teleport")).toEqual({
      ok: false,
      reason: "invalid-direction",
    });
  });

  it("prevents movement into a living enemy", () => {
    const room = createRoom();
    room.players.set("p1", createPlayer("p1", "One", { x: 1, y: 1 }));
    addEnemy(room);

    expect(tryMovePlayer(room, "p1", "right")).toEqual({
      ok: false,
      reason: "enemy-occupied",
    });
    expect(room.players.get("p1")).toMatchObject({ x: 1, y: 1 });
  });

  it("prevents defeated players from moving", () => {
    const room = createRoom();
    const player = createPlayer("p1", "One", { x: 1, y: 1 });
    room.players.set(player.id, player);
    updatePlayerHealth(room, player.id, 0);

    expect(tryMovePlayer(room, player.id, "right")).toEqual({
      ok: false,
      reason: "defeated",
    });
    expect(player).toMatchObject({ x: 1, y: 1, hp: 0, status: "defeated" });
  });
});
