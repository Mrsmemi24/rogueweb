import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { NextRequest } from "next/server";

function parsePositiveInteger(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const playerId = session?.user?.id;

  if (!playerId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInteger(searchParams.get("page"), 1, 100_000);
  const limit = parsePositiveInteger(searchParams.get("limit"), 20, 50);

  if (page === null || limit === null) {
    return Response.json({ error: "Invalid pagination parameters" }, { status: 400 });
  }

  const where = { playerId };
  const prisma = getPrismaClient();
  const [data, total] = await Promise.all([
    prisma.matchHistory.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        playerName: true,
        levelReached: true,
        enemiesDefeated: true,
        durationSeconds: true,
        result: true,
        createdAt: true,
      },
    }),
    prisma.matchHistory.count({ where }),
  ]);

  return Response.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
