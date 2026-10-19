import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { auth, count, createMany, findMany } = vi.hoisted(() => ({
  auth: vi.fn(),
  count: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({
  getPrismaClient: () => ({ matchHistory: { count, createMany, findMany } }),
}));

const { GET, POST } = await import("./route");

describe("GET /api/telemetry", () => {
  beforeEach(() => {
    auth.mockReset();
    count.mockReset();
    createMany.mockReset();
    findMany.mockReset();
    findMany.mockResolvedValue([
      {
        id: "match-1",
        playerName: "Explorador",
        levelReached: 2,
        enemiesDefeated: 1,
        durationSeconds: 90,
        result: "victory",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    count.mockResolvedValue(12);
    createMany.mockResolvedValue({ count: 1 });
  });

  it("rejects anonymous requests without reading private history", async () => {
    auth.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/telemetry")
    );

    expect(response.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("returns only the signed-in player's safe paginated match history", async () => {
    auth.mockResolvedValue({ user: { id: "github:viewer" } });

    const response = await GET(
      new NextRequest("http://localhost/api/telemetry?page=2&limit=5")
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: "github:viewer" },
        skip: 5,
        take: 5,
        select: {
          id: true,
          playerName: true,
          levelReached: true,
          enemiesDefeated: true,
          durationSeconds: true,
          result: true,
          createdAt: true,
        },
      })
    );
    expect(count).toHaveBeenCalledWith({
      where: { playerId: "github:viewer" },
    });
    expect(await response.json()).toEqual({
      data: [
        {
          id: "match-1",
          playerName: "Explorador",
          levelReached: 2,
          enemiesDefeated: 1,
          durationSeconds: 90,
          result: "victory",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 2, limit: 5, total: 12, totalPages: 3 },
    });
  });

  it.each(["page=0", "page=abc", "page=100001", "limit=0", "limit=51"])(
    "rejects malformed pagination: %s",
    async (query) => {
      auth.mockResolvedValue({ user: { id: "github:viewer" } });

      const response = await GET(
        new NextRequest(`http://localhost/api/telemetry?${query}`)
      );

      expect(response.status).toBe(400);
      expect(findMany).not.toHaveBeenCalled();
    }
  );
});

describe("POST /api/telemetry", () => {
  const matchRecord = {
    matchId: "b07940d4-2f6d-4c0f-a88e-a12a326a0780",
    durationSeconds: 90,
    levelReached: 2,
    enemiesDefeated: 1,
    result: "defeat",
  };

  beforeEach(() => {
    auth.mockReset();
    createMany.mockReset();
    createMany.mockResolvedValue({ count: 1 });
  });

  it("requires an authenticated player and does not write anonymous records", async () => {
    auth.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/telemetry", {
        method: "POST",
        body: JSON.stringify(matchRecord),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(401);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("persists sanitized account identity and defeat data idempotently", async () => {
    auth.mockResolvedValue({
      user: { id: "github:player-one", name: "  Ada\u0000 Explorer  " },
    });
    createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      count: 0,
    });

    const request = () =>
      new NextRequest("http://localhost/api/telemetry", {
        method: "POST",
        body: JSON.stringify(matchRecord),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      });
    const response = await POST(request());
    const duplicateResponse = await POST(request());

    expect(response.status).toBe(200);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          ...matchRecord,
          playerId: "github:player-one",
          playerName: "Ada Explorer",
          inventory: { items: [] },
        },
      ],
      skipDuplicates: true,
    });
    expect(await response.json()).toEqual({ saved: true });
    expect(await duplicateResponse.json()).toEqual({ saved: false });
    expect(createMany).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid records and cross-origin writes", async () => {
    auth.mockResolvedValue({ user: { id: "github:player-one" } });

    const invalidResponse = await POST(
      new NextRequest("http://localhost/api/telemetry", {
        method: "POST",
        body: JSON.stringify({
          ...matchRecord,
          result: "victory",
          playerId: "github:victim",
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      })
    );
    const originResponse = await POST(
      new NextRequest("http://localhost/api/telemetry", {
        method: "POST",
        body: JSON.stringify(matchRecord),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
      })
    );

    expect(invalidResponse.status).toBe(400);
    expect(originResponse.status).toBe(403);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before JSON parsing", async () => {
    auth.mockResolvedValue({ user: { id: "github:player-one" } });

    const response = await POST(
      new NextRequest("http://localhost/api/telemetry", {
        method: "POST",
        body: `{"payload":"${"x".repeat(2_049)}"}`,
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      })
    );

    expect(response.status).toBe(413);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("returns a structured service error when the database is unavailable", async () => {
    auth.mockResolvedValue({ user: { id: "github:player-one" } });
    createMany.mockRejectedValue(new Error("private database detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await POST(
        new NextRequest("http://localhost/api/telemetry", {
          method: "POST",
          body: JSON.stringify(matchRecord),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
        })
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Could not save match telemetry",
      });
      expect(log.mock.calls[0][0]).not.toContain("private database detail");
    } finally {
      log.mockRestore();
    }
  });
});
