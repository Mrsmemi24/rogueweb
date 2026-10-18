import { jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createRoomState, createPlayer } from "./game.js";
import {
  createCompletedMatchPayload,
  persistCompletedMatch,
} from "./match-history.js";

const SECRET = "test-socket-auth-secret-with-32-bytes-min";

function completedRoom() {
  const room = createRoomState(123);
  const player = createPlayer(
    "public-player-id",
    "  Ana\u0000 ",
    room.dungeon.spawns[0],
    "github:ana"
  );
  player.level = 3;
  player.enemiesDefeated = 4;
  player.inventory = [" poción ", "", "llave"];
  room.players.set("github:ana", player);
  room.status = "victory";
  room.matchId = "b07940d4-2f6d-4c0f-a88e-a12a326a0780";
  room.startedAt = 10_000;
  return room;
}

describe("completed match persistence", () => {
  it("creates sanitized per-account records only for terminal rooms", () => {
    const room = completedRoom();

    expect(createCompletedMatchPayload({ ...room, status: "active" }, 12_000)).toBe(
      undefined
    );
    expect(createCompletedMatchPayload(room, 12_000)).toEqual({
      matchId: room.matchId,
      durationSeconds: 2,
      result: "victory",
      players: [
        {
          playerId: "github:ana",
          playerName: "Ana",
          levelReached: 3,
          enemiesDefeated: 4,
          inventory: { items: ["poción", "llave"] },
        },
      ],
    });
  });

  it("sends signed snapshots and retries transient failures", async () => {
    const payload = createCompletedMatchPayload(completedRoom(), 12_000)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      persistCompletedMatch(payload, {
        endpoint: "http://127.0.0.1:3000/api/internal/match-history",
        secret: SECRET,
        fetcher,
        wait,
      })
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
    const request = fetcher.mock.calls[1][1];
    const authorization = request?.headers as Record<string, string>;
    const token = authorization.Authorization.slice("Bearer ".length);
    const verified = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "rogueweb-socket",
      audience: "rogueweb-match-history",
    });
    expect(verified.payload.sub).toBe(payload.matchId);
    expect(verified.payload.result).toBe("victory");
  });

  it("rejects invalid endpoints without attempting network access", async () => {
    const payload = createCompletedMatchPayload(completedRoom(), 12_000)!;
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      persistCompletedMatch(payload, {
        endpoint: "not a URL",
        secret: SECRET,
        fetcher,
      })
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
