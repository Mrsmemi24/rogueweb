import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createSocketAccessToken } from "./socket-token";

const SECRET = "test-socket-auth-secret-with-32-bytes-min";

describe("Socket access token creation", () => {
  it("signs an expiring token for the trusted user subject", async () => {
    const token = await createSocketAccessToken(
      "github:verified-user",
      SECRET
    );
    const verified = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "rogueweb-web",
      audience: "rogueweb-socket",
      algorithms: ["HS256"],
    });

    expect(verified.payload.sub).toBe("github:verified-user");
    expect(verified.payload.exp! - verified.payload.iat!).toBe(60);
  });

  it("rejects missing identities and weak signing secrets", async () => {
    await expect(createSocketAccessToken(" ", SECRET)).rejects.toThrow();
    await expect(createSocketAccessToken("github:user", "short")).rejects.toThrow();
  });
});
