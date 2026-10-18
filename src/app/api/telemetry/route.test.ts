import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { auth, count, findMany } = vi.hoisted(() => ({
  auth: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/prisma", () => ({
  getPrismaClient: () => ({ matchHistory: { count, findMany } }),
}));

const { GET } = await import("./route");

describe("GET /api/telemetry", () => {
  beforeEach(() => {
    auth.mockReset();
    count.mockReset();
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
