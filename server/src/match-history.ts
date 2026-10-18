import { createMatchWriteToken } from "./auth.js";
import type { Player, RoomState } from "./game.js";

export type CompletedMatchPayload = {
  matchId: string;
  durationSeconds: number;
  result: "victory" | "defeat";
  players: Array<{
    playerId: string;
    playerName: string;
    levelReached: number;
    enemiesDefeated: number;
    inventory: { items: string[] };
  }>;
};

export function createCompletedMatchPayload(
  room: RoomState,
  now = Date.now()
): CompletedMatchPayload | undefined {
  if (
    room.status !== "victory" &&
    room.status !== "defeat"
  ) {
    return undefined;
  }
  if (!room.matchId || room.startedAt === undefined) {
    throw new Error("Completed room has no match metadata");
  }

  const players = Array.from(room.players.values()).flatMap((player: Player) => {
    if (!player.userId) return [];

    return [
      {
        playerId: player.userId,
        playerName:
          player.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20) ||
          "Explorador",
        levelReached: player.level,
        enemiesDefeated: player.enemiesDefeated,
        inventory: {
          items: (player.inventory ?? [])
            .filter((item) => typeof item === "string")
            .map((item) => item.trim().slice(0, 64))
            .filter(Boolean)
            .slice(0, 100),
        },
      },
    ];
  });

  if (players.length === 0) return undefined;

  return {
    matchId: room.matchId,
    durationSeconds: Math.max(
      0,
      Math.floor((now - room.startedAt) / 1000)
    ),
    result: room.status,
    players,
  };
}

export async function persistCompletedMatch(
  payload: CompletedMatchPayload,
  options: {
    endpoint?: string;
    secret?: string;
    fetcher?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
  } = {}
) {
  const endpoint =
    options.endpoint ??
    process.env.MATCH_HISTORY_URL ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://127.0.0.1:3000/api/internal/match-history");
  if (!endpoint) {
    console.error(
      `Match-history persistence is not configured for match ${payload.matchId}.`
    );
    return false;
  }

  let target: URL;
  try {
    target = new URL(endpoint);
  } catch {
    console.error(
      `Match-history persistence endpoint is invalid for match ${payload.matchId}.`
    );
    return false;
  }

  if (
    target.username ||
    target.password ||
    !["http:", "https:"].includes(target.protocol) ||
    (process.env.NODE_ENV === "production" && target.protocol !== "https:")
  ) {
    console.error(
      `Match-history persistence endpoint is invalid for match ${payload.matchId}.`
    );
    return false;
  }

  const fetcher = options.fetcher ?? fetch;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const token = await createMatchWriteToken(
        payload.matchId,
        {
          durationSeconds: payload.durationSeconds,
          result: payload.result,
          players: payload.players,
        },
        options.secret
      );
      const response = await fetcher(target, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(5_000),
      });

      if (response.ok) return true;
      if (response.status < 500 && response.status !== 429) {
        console.error(
          `Match-history persistence rejected match ${payload.matchId} with status ${response.status}.`
        );
        return false;
      }
    } catch (error) {
      if (attempt === 2) {
        const errorName =
          error instanceof Error ? error.name.slice(0, 64) : "UnknownError";
        console.error(
          `Match-history persistence failed for match ${payload.matchId} (${errorName}).`
        );
        return false;
      }
    }

    if (attempt < 2) {
      await wait(250 * 2 ** attempt);
    }
  }

  console.error(
    `Match-history persistence exhausted retries for match ${payload.matchId}.`
  );
  return false;
}
