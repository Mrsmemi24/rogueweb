const WIDTH = 31;
const HEIGHT = 21;
function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function key(position) {
    return `${position.x},${position.y}`;
}
function findDistances(grid, start) {
    const distances = new Map();
    const queue = [start];
    distances.set(key(start), 0);
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        const distance = distances.get(key(current));
        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 },
        ];
        for (const next of neighbors) {
            if (next.x < 0 ||
                next.x >= WIDTH ||
                next.y < 0 ||
                next.y >= HEIGHT) {
                continue;
            }
            if (!grid[next.y][next.x])
                continue;
            const nextKey = key(next);
            if (distances.has(nextKey))
                continue;
            distances.set(nextKey, distance + 1);
            queue.push(next);
        }
    }
    return distances;
}
export function generateDungeon(seed = Date.now() >>> 0) {
    if (!Number.isInteger(seed) ||
        seed < 0 ||
        seed > 0xffff_ffff) {
        throw new RangeError("Dungeon seed must be an unsigned 32-bit integer.");
    }
    const normalizedSeed = seed >>> 0;
    const random = createRandom(normalizedSeed);
    // true significa suelo; false significa pared.
    const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(false));
    const start = { x: 1, y: 1 };
    const stack = [start];
    grid[start.y][start.x] = true;
    // DFS: abre pasillos saltando una casilla entre celdas.
    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const directions = shuffle([
            { dx: 2, dy: 0 },
            { dx: -2, dy: 0 },
            { dx: 0, dy: 2 },
            { dx: 0, dy: -2 },
        ], random);
        let carved = false;
        for (const { dx, dy } of directions) {
            const nx = current.x + dx;
            const ny = current.y + dy;
            if (nx <= 0 ||
                nx >= WIDTH - 1 ||
                ny <= 0 ||
                ny >= HEIGHT - 1) {
                continue;
            }
            if (grid[ny][nx])
                continue;
            // Abre la casilla intermedia y la de destino.
            grid[current.y + dy / 2][current.x + dx / 2] = true;
            grid[ny][nx] = true;
            stack.push({ x: nx, y: ny });
            carved = true;
            break;
        }
        if (!carved) {
            stack.pop();
        }
    }
    // Encuentra todas las casillas accesibles desde el inicio.
    const distances = findDistances(grid, start);
    // La salida estará en la casilla más alejada del inicio.
    let exit = start;
    let maxDistance = -1;
    for (const [positionKey, distance] of distances) {
        if (distance > maxDistance) {
            maxDistance = distance;
            const [x, y] = positionKey.split(",").map(Number);
            exit = { x, y };
        }
    }
    // Selecciona posiciones separadas para los jugadores.
    const candidates = Array.from(distances.keys())
        .filter((positionKey) => positionKey !== key(exit))
        .map((positionKey) => {
        const [x, y] = positionKey.split(",").map(Number);
        return { x, y };
    })
        .sort((a, b) => distances.get(key(a)) - distances.get(key(b)));
    const spawns = [];
    const used = new Set();
    for (const candidate of candidates) {
        if (spawns.length >= 4)
            break;
        // Separa las apariciones para evitar que nazcan juntas.
        const farEnough = spawns.every((spawn) => Math.abs(spawn.x - candidate.x) +
            Math.abs(spawn.y - candidate.y) >=
            4);
        if (!farEnough && spawns.length > 0)
            continue;
        spawns.push(candidate);
        used.add(key(candidate));
    }
    const map = grid.map((row) => row.map((isFloor) => (isFloor ? "." : "#")).join(""));
    return {
        seed: normalizedSeed,
        map,
        exit,
        spawns,
    };
}
