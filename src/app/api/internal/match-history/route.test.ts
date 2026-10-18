import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMany } = vi.hoisted(() => ({ createMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  getPrismaClient: () => ({ matchHistory: { createMany } }),
}));
vi.mock("@/lib/socket-token", () => ({
  getSocketAuthKey: () => {
    const secret = process.env.SOCKET_AUTH_SECRET;
    if (!secret) throw new Error("Socket auth is not configured");
    return new TextEncoder().encode(secret);
  },
  MATCH_WRITE_TOKEN_AUDIENCE: "rogueweb-match-history",
  MATCH_WRITE_TOKEN_ISSUER: "rogueweb-socket",
}));

const SECRET = "test-socket-auth-secret-with-32-bytes-min";
process.env.SOCKET_AUTH_SECRET = SECRET;
const { POST } = await import("./route");

function validPlayer(playerId = "github:player-one") {
  return {
    playerId,
    playerName: "Explorador",
    levelReached: 2,
    enemiesDefeated: 1,
    inventory: { items: ["potion"] },
  };
}

async function signedMatchToken(
  claims: Record<string, unknown> = {
    durationSeconds: 90,
    result: "victory",
    players: [validPlayer()],
  },
  options: { audience?: string; expiresAt?: number } = {}
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("rogueweb-socket")
    .setAudience(options.audience ?? "rogueweb-match-history")
    .setSubject("b07940d4-2f6d-4c0f-a88e-a12a326a0780")
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? "15s")
    .sign(new TextEncoder().encode(SECRET));
}

function request(token?: string) {
  return new Request("http://localhost/api/internal/match-history", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("POST /api/internal/match-history", () => {
  beforeEach(() => {
    createMany.mockReset();
    createMany.mockResolvedValue({ count: 1 });
  });

  it("rejects requests without a server-signed match token", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures, expired tokens and the wrong audience", async () => {
    const invalid = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("invalid-signing-key"));
    const expired = await signedMatchToken(
      undefined,
      { expiresAt: Math.floor(Date.now() / 1000) - 1 }
    );
    const wrongAudience = await signedMatchToken(undefined, {
      audience: "rogueweb-socket",
    });

    for (const token of [invalid, expired, wrongAudience]) {
      expect((await POST(request(token))).status).toBe(401);
    }
    expect(createMany).not.toHaveBeenCalled();
  });

  it("persists each authenticated participant once from signed server state", async () => {
    const token = await signedMatchToken({
      durationSeconds: 90,
      result: "defeat",
      players: [validPlayer(), validPlayer("github:player-two")],
    });
    createMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({
      count: 0,
    });

    const firstResponse = await POST(request(token));
    const secondResponse = await POST(request(token));

    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            matchId: "b07940d4-2f6d-4c0f-a88e-a12a326a0780",
            playerId: "github:player-one",
            result: "defeat",
            durationSeconds: 90,
            inventory: { items: ["potion"] },
          }),
          expect.objectContaining({
            playerId: "github:player-two",
          }),
        ],
      })
    );
    expect(await firstResponse.json()).toEqual({ savedCount: 2 });
    expect(await secondResponse.json()).toEqual({ savedCount: 0 });
  });

  it("rejects malformed signed payloads without writing records", async () => {
    const token = await signedMatchToken({
      durationSeconds: -1,
      result: "abandoned",
      players: [{ ...validPlayer(), playerId: "" }],
    });

    const response = await POST(request(token));

    expect(response.status).toBe(400);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("reports database failures without logging private match contents", async () => {
    const token = await signedMatchToken();
    createMany.mockRejectedValue(new Error("private database details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await POST(request(token));
      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0][0]).toContain(
        "b07940d4-2f6d-4c0f-a88e-a12a326a0780"
      );
      expect(log.mock.calls[0][0]).not.toContain("Explorador");
      expect(log.mock.calls[0][0]).not.toContain("private database details");
    } finally {
      log.mockRestore();
    }
  });
});
