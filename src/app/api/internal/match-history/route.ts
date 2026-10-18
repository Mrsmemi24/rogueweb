import { jwtVerify } from "jose";
import { z } from "zod";
import {
  getSocketAuthKey,
  MATCH_WRITE_TOKEN_AUDIENCE,
  MATCH_WRITE_TOKEN_ISSUER,
} from "@/lib/socket-token";
import { getPrismaClient } from "@/lib/prisma";

const PlayerSchema = z
  .object({
    playerId: z.string().min(1).max(255),
    playerName: z.string().trim().min(1).max(20),
    levelReached: z.number().int().min(1).max(1_000),
    enemiesDefeated: z.number().int().min(0).max(1_000_000),
    inventory: z
      .object({ items: z.array(z.string().trim().min(1).max(64)).max(100) })
      .strict(),
  })
  .strict();

const MatchSchema = z
  .object({
    matchId: z.string().uuid(),
    durationSeconds: z.number().int().min(0).max(31_536_000),
    result: z.enum(["victory", "defeat"]),
    players: z.array(PlayerSchema).min(1).max(4),
  })
  .strict();

const ALLOWED_CLAIMS = new Set([
  "iss",
  "aud",
  "sub",
  "iat",
  "exp",
  "durationSeconds",
  "result",
  "players",
]);

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const matchToken =
    authorization?.startsWith("Bearer ") && authorization.length <= 12_000
      ? authorization.slice("Bearer ".length)
      : undefined;

  if (!matchToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    const verified = await jwtVerify(matchToken, getSocketAuthKey(), {
      issuer: MATCH_WRITE_TOKEN_ISSUER,
      audience: MATCH_WRITE_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
    });
    payload = verified.payload;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    Object.keys(payload).some((claim) => !ALLOWED_CLAIMS.has(claim)) ||
    typeof payload.sub !== "string"
  ) {
    return Response.json({ error: "Invalid match record" }, { status: 400 });
  }

  const parsed = MatchSchema.safeParse({
    matchId: payload.sub,
    durationSeconds: payload.durationSeconds,
    result: payload.result,
    players: payload.players,
  });

  if (!parsed.success) {
    return Response.json({ error: "Invalid match record" }, { status: 400 });
  }

  const { matchId, durationSeconds, result, players } = parsed.data;
  try {
    const created = await getPrismaClient().matchHistory.createMany({
      data: players.map((player) => ({
        matchId,
        playerId: player.playerId,
        playerName: player.playerName,
        levelReached: player.levelReached,
        enemiesDefeated: player.enemiesDefeated,
        durationSeconds,
        inventory: player.inventory,
        result,
      })),
      skipDuplicates: true,
    });

    return Response.json({ savedCount: created.count });
  } catch (error) {
    console.error(
      `Could not save completed match ${matchId} (${error instanceof Error ? error.name : "UnknownError"}).`
    );
    return Response.json(
      { error: "Could not save completed match" },
      { status: 503 }
    );
  }
}
