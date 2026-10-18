import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  createSocketAccessToken,
  verifySocketAccessToken,
} from "./auth.js";

const SECRET = "test-only-socket-secret-at-least-32-bytes";

describe("Socket.IO access-token verification", () => {
  it("accepts a signed token and returns only its trusted subject", async () => {
    const token = await createSocketAccessToken(
      "github:12345",
      SECRET,
      1_800_000_000_000
    );

    await expect(verifySocketAccessToken(token, SECRET)).resolves.toEqual({
      userId: "github:12345",
      expiresAt: 1_800_000_060_000,
    });
  });

  it.each([undefined, 123, "not-a-jwt"])(
    "rejects missing or malformed tokens: %s",
    async (token) => {
      await expect(
        verifySocketAccessToken(token, SECRET)
      ).rejects.toThrow();
    }
  );

  it("rejects expired tokens", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("rogueweb-web")
      .setAudience("rogueweb-socket")
      .setSubject("github:12345")
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_001)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySocketAccessToken(token, SECRET)).rejects.toThrow();
  });

  it("rejects the wrong audience and invalid signing secret", async () => {
    const wrongAudience = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("rogueweb-web")
      .setAudience("rogueweb-other-service")
      .setSubject("github:12345")
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET));
    const valid = await createSocketAccessToken("github:12345", SECRET);

    await expect(
      verifySocketAccessToken(wrongAudience, SECRET)
    ).rejects.toThrow();
    await expect(verifySocketAccessToken(valid, "wrong-secret")).rejects.toThrow();
  });
});
