import { SignJWT } from "jose";

export const SOCKET_TOKEN_ISSUER = "rogueweb-web";
export const SOCKET_TOKEN_AUDIENCE = "rogueweb-socket";
export const MATCH_WRITE_TOKEN_ISSUER = "rogueweb-socket";
export const MATCH_WRITE_TOKEN_AUDIENCE = "rogueweb-match-history";

export function getSocketAuthKey(secret = process.env.SOCKET_AUTH_SECRET) {
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("SOCKET_AUTH_SECRET must be at least 32 bytes");
  }

  return new TextEncoder().encode(secret);
}

export async function createSocketAccessToken(
  userId: string,
  secret = process.env.SOCKET_AUTH_SECRET
) {
  if (!userId.trim()) {
    throw new Error("A trusted user identity is required");
  }

  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SOCKET_TOKEN_ISSUER)
    .setAudience(SOCKET_TOKEN_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("60s")
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
