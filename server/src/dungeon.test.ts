import { describe, expect, it } from "vitest";
import { generateDungeon } from "./dungeon.js";

function reachableFrom(
  map: string[],
  start: { x: number; y: number }
): Set<string> {
  const reachable = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];

    for (const direction of directions) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };
      const key = `${next.x},${next.y}`;

      if (
        next.y < 0 ||
        next.y >= map.length ||
        next.x < 0 ||
        next.x >= map[next.y].length ||
        map[next.y][next.x] !== "." ||
        reachable.has(key)
      ) {
        continue;
      }

      reachable.add(key);
      queue.push(next);
    }
  }

  return reachable;
}

describe("server dungeon generation", () => {
  it("generates the same dungeon for the same seed", () => {
    expect(generateDungeon(42)).toEqual(generateDungeon(42));
  });

  it("produces different maps for different seeds", () => {
    expect(generateDungeon(42).map).not.toEqual(
      generateDungeon(43).map
    );
  });

  it("keeps dimensions bounded and uses only wall and floor tiles", () => {
    const dungeon = generateDungeon(2025);

    expect(dungeon.map).toHaveLength(21);
    expect(dungeon.map.every((row) => row.length === 31)).toBe(true);
    expect(dungeon.map.flatMap((row) => [...row])).toEqual(
      expect.arrayContaining(["#", "."])
    );
    expect(
      dungeon.map.every((row) => /^[#.]+$/.test(row))
    ).toBe(true);
  });

  it("creates reachable, unique floor spawns and an exit", () => {
    const dungeon = generateDungeon(9876);
    const reachable = reachableFrom(dungeon.map, dungeon.spawns[0]);
    const allPositions = [...dungeon.spawns, dungeon.exit];
    const positionKeys = allPositions.map(
      (position) => `${position.x},${position.y}`
    );

    expect(dungeon.spawns.length).toBeGreaterThanOrEqual(2);
    expect(new Set(positionKeys).size).toBe(positionKeys.length);

    for (const position of allPositions) {
      expect(dungeon.map[position.y][position.x]).toBe(".");
      expect(reachable.has(`${position.x},${position.y}`)).toBe(true);
    }
  });

  it("provides four distinct player spawns for a range of seeds", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { spawns } = generateDungeon(seed);

      expect(spawns).toHaveLength(4);
      expect(new Set(spawns.map(({ x, y }) => `${x},${y}`)).size).toBe(4);
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 0x1_0000_0000])(
    "rejects invalid seed %s",
    (seed) => {
      expect(() => generateDungeon(seed)).toThrow(RangeError);
    }
  );
});
