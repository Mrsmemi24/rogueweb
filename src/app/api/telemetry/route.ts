import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { z } from "zod";

const SoloMatchSchema = z
  .object({
    matchId: z.string().uuid(),
    durationSeconds: z.number().int().min(0).max(31_536_000),
    levelReached: z.number().int().min(1).max(1_000),
    enemiesDefeated: z.number().int().min(0).max(1_000_000),
    result: z.literal("defeat"),
  })
  .strict();

async function readLimitedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, reason: "invalid" as const };

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > 2_048) {
        void reader.cancel().catch(() => {});
        return { ok: false as const, reason: "too-large" as const };
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      ok: true as const,
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    };
  } catch {
    return { ok: false as const, reason: "invalid" as const };
  }
}

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

export async function POST(request: NextRequest) {
  const session = await auth();
  const playerId = session?.user?.id;

  if (!playerId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON content type required" }, { status: 415 });
  }

  const body = await readLimitedJson(request);
  if (!body.ok && body.reason === "too-large") {
    return Response.json({ error: "Request body is too large" }, { status: 413 });
  }
  if (!body.ok) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SoloMatchSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "Invalid match record" }, { status: 400 });
  }

  const playerName =
    session.user?.name?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20) ||
    "Explorador";

  try {
    const created = await getPrismaClient().matchHistory.createMany({
      data: [
        {
          matchId: parsed.data.matchId,
          playerId,
          playerName,
          levelReached: parsed.data.levelReached,
          enemiesDefeated: parsed.data.enemiesDefeated,
          durationSeconds: parsed.data.durationSeconds,
          inventory: { items: [] },
          result: parsed.data.result,
        },
      ],
      skipDuplicates: true,
    });

    return Response.json({ saved: created.count === 1 });
  } catch (error) {
    console.error(
      `Could not save solo match ${parsed.data.matchId} (${error instanceof Error ? error.name : "UnknownError"}).`
    );
    return Response.json(
      { error: "Could not save match telemetry" },
      { status: 503 }
    );
  }
}
