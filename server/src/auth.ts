import { jwtVerify, SignJWT } from "jose";

export const SOCKET_TOKEN_ISSUER = "rogueweb-web";
export const SOCKET_TOKEN_AUDIENCE = "rogueweb-socket";
export const MATCH_WRITE_TOKEN_ISSUER = "rogueweb-socket";
export const MATCH_WRITE_TOKEN_AUDIENCE = "rogueweb-match-history";

export type SocketIdentity = {
  userId: string;
  expiresAt: number;
};

export function getSocketAuthKey(secret = process.env.SOCKET_AUTH_SECRET) {
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("SOCKET_AUTH_SECRET must be at least 32 bytes");
  }

  return new TextEncoder().encode(secret);
}

export async function createSocketAccessToken(
  userId: string,
  secret = process.env.SOCKET_AUTH_SECRET,
  now = Date.now()
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SOCKET_TOKEN_ISSUER)
    .setAudience(SOCKET_TOKEN_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + 60)
    .sign(getSocketAuthKey(secret));
}

export async function createMatchWriteToken(
  matchId: string,
  match: {
    durationSeconds: number;
    result: "victory" | "defeat";
    players: Array<{
      playerId: string;
      playerName: string;
      levelReached: number;
      enemiesDefeated: number;
      inventory: { items: string[] };
    }>;
  },
  secret = process.env.SOCKET_AUTH_SECRET
) {
  return new SignJWT(match)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MATCH_WRITE_TOKEN_ISSUER)
    .setAudience(MATCH_WRITE_TOKEN_AUDIENCE)
    .setSubject(matchId)
    .setIssuedAt()
    .setExpirationTime("15s")
    .sign(getSocketAuthKey(secret));
}

export async function verifySocketAccessToken(
  token: unknown,
  secret = process.env.SOCKET_AUTH_SECRET
): Promise<SocketIdentity> {
  if (typeof token !== "string" || token.length > 4096) {
    throw new Error("Missing or invalid socket access token");
  }

  const { payload } = await jwtVerify(token, getSocketAuthKey(secret), {
    issuer: SOCKET_TOKEN_ISSUER,
    audience: SOCKET_TOKEN_AUDIENCE,
    algorithms: ["HS256"],
  });

  if (typeof payload.sub !== "string" || payload.sub.length > 255) {
    throw new Error("Socket token has no valid subject");
  }

  if (typeof payload.exp !== "number") {
    throw new Error("Socket token has no expiration");
  }

  return { userId: payload.sub, expiresAt: payload.exp * 1000 };
}
