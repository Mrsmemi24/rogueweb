
import { describe, expect, it } from "vitest";

import {
  findFarthestFloor,
  generateMaze,
  isWalkable,
} from "./maze";

function countReachableFloors(maze: number[][]): number {
  const visited = new Set<string>();
  const queue = [{ x: 1, y: 1 }];
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  visited.add("1,1");

  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];

    for (const { dx, dy } of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;

      if (!isWalkable(maze, x, y) || visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push({ x, y });
    }
  }

  return visited.size;
}

function getDistances(maze: number[][]): Map<string, number> {
  const distances = new Map<string, number>();
  const queue = [{ x: 1, y: 1, distance: 0 }];
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  distances.set("1,1", 0);

  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];

    for (const { dx, dy } of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;

      if (!isWalkable(maze, x, y) || distances.has(key)) {
        continue;
      }

      const distance = current.distance + 1;

      distances.set(key, distance);
      queue.push({ x, y, distance });
    }
  }

  return distances;
}

describe("Generador de mazmorras de RogueWeb", () => {
  it("1. Genera el número esperado de filas y columnas", () => {
    const maze = generateMaze(25, 13, 12345);

    expect(maze).toHaveLength(13);
    expect(maze[0]).toHaveLength(25);
  });

  it("2. Produce el mismo mapa con la misma semilla", () => {
    const first = generateMaze(25, 13, 12345);
    const second = generateMaze(25, 13, 12345);

    expect(second).toEqual(first);
  });

  it("3. Puede producir mapas diferentes con semillas diferentes", () => {
    const first = generateMaze(25, 13, 12345);
    const second = generateMaze(25, 13, 54321);

    expect(second).not.toEqual(first);
  });

  it("4. Mantiene las paredes del borde exterior", () => {
    const maze = generateMaze(25, 13, 12345);
    const lastRow = maze.length - 1;
    const lastColumn = maze[0].length - 1;

    for (let x = 0; x <= lastColumn; x++) {
      expect(maze[0][x]).toBe(0);
      expect(maze[lastRow][x]).toBe(0);
    }

    for (let y = 0; y <= lastRow; y++) {
      expect(maze[y][0]).toBe(0);
      expect(maze[y][lastColumn]).toBe(0);
    }
  });

  it("5. Coloca un camino en la posición inicial", () => {
    const maze = generateMaze(25, 13, 12345);

    expect(isWalkable(maze, 1, 1)).toBe(true);
  });

  it("6. Solo utiliza 0 y 1 en la matriz", () => {
    const maze = generateMaze(25, 13, 12345);

    for (const row of maze) {
      for (const cell of row) {
        expect([0, 1]).toContain(cell);
      }
    }
  });

  it("7. Mantiene conectados todos los pasillos generados", () => {
    const maze = generateMaze(25, 13, 12345);

    const totalFloors = maze
      .flat()
      .filter((cell) => cell === 1).length;

    const reachableFloors = countReachableFloors(maze);

    expect(reachableFloors).toBe(totalFloors);
  });

  it("8. Coloca la salida en una casilla transitable", () => {
    const maze = generateMaze(25, 13, 12345);
    const exit = findFarthestFloor(maze);

    expect(isWalkable(maze, exit.x, exit.y)).toBe(true);
  });

  it("9. Encuentra una de las casillas más alejadas del inicio", () => {
    const maze = generateMaze(25, 13, 12345);
    const exit = findFarthestFloor(maze);

    const distances = getDistances(maze);
    const exitDistance = distances.get(`${exit.x},${exit.y}`);

    const maximumDistance = Math.max(...distances.values());

    expect(exitDistance).toBe(maximumDistance);
  });

  it("10. Rechaza paredes y coordenadas fuera del mapa", () => {
    const maze = generateMaze(25, 13, 12345);

    expect(isWalkable(maze, 0, 0)).toBe(false);
    expect(isWalkable(maze, -1, 1)).toBe(false);
    expect(isWalkable(maze, 1, -1)).toBe(false);
    expect(isWalkable(maze, 25, 1)).toBe(false);
    expect(isWalkable(maze, 1, 13)).toBe(false);
    expect(isWalkable(maze, 1.5, 1)).toBe(false);
  });
});
