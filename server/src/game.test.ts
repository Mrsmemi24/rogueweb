import { describe, expect, it } from "vitest";
import {
  createPlayer,
  findAvailableSpawn,
  getOrCreateRoom,
  JoinRoomSchema,
  MoveIntentSchema,
  toPublicGameState,
  toPublicPlayerState,
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
  };
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
      level: 1,
      xp: 0,
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
          status: "alive",
        },
      ],
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
