import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(50, Number(searchParams.get("limit") || 20)); // máximo 50
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.matchHistory.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        playerId: true,
        playerName: true,
        levelReached: true,
        enemiesDefeated: true,
        durationSeconds: true,
        inventory: true,
        result: true,
        createdAt: true,
      },
    }),
    prisma.matchHistory.count(),
  ]);

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}