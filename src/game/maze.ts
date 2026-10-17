
export type Maze = number[][];

export type Point = {
  x: number;
  y: number;
};

// Convierte una semilla en un generador de números pseudoaleatorios.
// La misma semilla produce siempre la misma secuencia.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// El algoritmo necesita dimensiones impares de al menos 5.
function normalizeSize(size: number): number {
  let result = Number.isFinite(size) ? Math.floor(size) : 5;

  result = Math.max(5, result);

  if (result % 2 === 0) {
    result--;
  }

  return result;
}

// Genera una mazmorra mediante búsqueda en profundidad (DFS).
// 0 representa una pared y 1 representa un camino.
export function generateMaze(
  requestedColumns: number,
  requestedRows: number,
  seed: number
): Maze {
  const columns = normalizeSize(requestedColumns);
  const rows = normalizeSize(requestedRows);

  const random = createSeededRandom(seed);

  const maze: Maze = Array.from(
    { length: rows },
    () => Array(columns).fill(0)
  );

  maze[1][1] = 1;

  const stack: Point[] = [{ x: 1, y: 1 }];

  const directions = [
    { dx: 0, dy: -2 },
    { dx: 0, dy: 2 },
    { dx: -2, dy: 0 },
    { dx: 2, dy: 0 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];

    const candidates = directions.filter(({ dx, dy }) => {
      const nextX = current.x + dx;
      const nextY = current.y + dy;

      return (
        nextX > 0 &&
        nextX < columns - 1 &&
        nextY > 0 &&
        nextY < rows - 1 &&
        maze[nextY][nextX] === 0
      );
    });

    if (candidates.length === 0) {
      // No quedan caminos nuevos; retrocedemos.
      stack.pop();
      continue;
    }

    // Elegimos un vecino disponible de forma reproducible.
    const direction =
      candidates[Math.floor(random() * candidates.length)];

    const nextX = current.x + direction.dx;
    const nextY = current.y + direction.dy;

    // Abrimos el pasillo que conecta las dos casillas.
    const wallX = current.x + direction.dx / 2;
    const wallY = current.y + direction.dy / 2;

    maze[wallY][wallX] = 1;
    maze[nextY][nextX] = 1;

    stack.push({ x: nextX, y: nextY });
  }

  return maze;
}

// Comprueba que una casilla sea un camino y esté dentro del mapa.
export function isWalkable(
  maze: Maze,
  x: number,
  y: number
): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }

  if (y < 0 || y >= maze.length) {
    return false;
  }

  if (x < 0 || x >= (maze[y]?.length ?? 0)) {
    return false;
  }

  return maze[y][x] === 1;
}

// Busca la casilla transitable más alejada del inicio mediante BFS.
export function findFarthestFloor(maze: Maze): Point {
  if (
    maze.length < 3 ||
    !isWalkable(maze, 1, 1)
  ) {
    throw new Error("La mazmorra no tiene un punto de inicio válido.");
  }

  const rows = maze.length;
  const columns = maze[0].length;

  const visited = Array.from(
    { length: rows },
    () => Array(columns).fill(false)
  );

  const queue: Array<Point & { distance: number }> = [
    { x: 1, y: 1, distance: 0 },
  ];

  visited[1][1] = true;

  let head = 0;
  let farthest = queue[0];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (head < queue.length) {
    const current = queue[head++];

    if (current.distance > farthest.distance) {
      farthest = current;
    }

    for (const { dx, dy } of directions) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;

      if (!isWalkable(maze, nextX, nextY)) {
        continue;
      }

      if (visited[nextY][nextX]) {
        continue;
      }

      visited[nextY][nextX] = true;

      queue.push({
        x: nextX,
        y: nextY,
        distance: current.distance + 1,
      });
    }
  }

  return { x: farthest.x, y: farthest.y };
}
