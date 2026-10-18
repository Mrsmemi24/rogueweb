import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { count, findMany, prismaClient, postgresAdapter } = vi.hoisted(() => {
  const count = vi.fn();
  const findMany = vi.fn();
  const prismaClient = vi.fn(function () {
    return { matchHistory: { count, findMany } };
  });
  const postgresAdapter = vi.fn(function (options: {
    connectionString: string;
  }) {
    return { options };
  });

  return { count, findMany, prismaClient, postgresAdapter };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: postgresAdapter,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: prismaClient,
}));

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

const { GET } = await import("./route");

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

describe("GET /api/telemetry", () => {
  beforeEach(() => {
    count.mockClear();
    findMany.mockClear();
    findMany.mockResolvedValue([{ id: "match-1" }]);
    count.mockResolvedValue(12);
  });

  it("returns paginated match history", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/telemetry?page=2&limit=5")
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 })
    );
    expect(count).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      data: [{ id: "match-1" }],
      pagination: { page: 2, limit: 5, total: 12, totalPages: 3 },
    });
  });
});
