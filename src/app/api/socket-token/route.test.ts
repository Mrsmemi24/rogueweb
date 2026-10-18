import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, createSocketAccessToken } = vi.hoisted(() => ({
  auth: vi.fn(),
  createSocketAccessToken: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/socket-token", () => ({ createSocketAccessToken }));

const { GET } = await import("./route");

describe("GET /api/socket-token", () => {
  beforeEach(() => {
    auth.mockReset();
    createSocketAccessToken.mockReset();
  });

  it("requires a signed-in session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("issues a short-lived token for the server-validated session identity", async () => {
    auth.mockResolvedValue({ user: { id: "github:trusted-user" } });
    createSocketAccessToken.mockResolvedValue("signed-access-token");

    const response = await GET();
    const body = (await response.json()) as { token: string; expiresIn: number };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.expiresIn).toBe(60);
    expect(body.token).toBe("signed-access-token");
    expect(createSocketAccessToken).toHaveBeenCalledWith("github:trusted-user");
  });

  it("fails closed when the signing secret is unavailable", async () => {
    auth.mockResolvedValue({ user: { id: "github:trusted-user" } });
    createSocketAccessToken.mockRejectedValue(new Error("not configured"));

    const response = await GET();
    expect(response.status).toBe(503);
  });
});
