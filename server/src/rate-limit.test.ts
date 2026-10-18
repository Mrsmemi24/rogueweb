import { describe, expect, it } from "vitest";
import {
  EVENT_WINDOW_MS,
  HandshakeRateLimiter,
  SocketEventRateLimiter,
} from "./rate-limit.js";

describe("Socket.IO rate limits", () => {
  it("allows eight joins and rejects the ninth within ten seconds", () => {
    const limiter = new SocketEventRateLimiter();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(limiter.consume("socket-a", "lobby:join", 1000 + attempt)).toBe(
        "allowed"
      );
    }

    expect(limiter.consume("socket-a", "lobby:join", 1008)).toBe("limited");
    expect(limiter.consume("socket-a", "game:move", 1009)).toBe("allowed");
  });

  it("disconnects after five limit violations in one window", () => {
    const limiter = new SocketEventRateLimiter();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      limiter.consume("socket-a", "lobby:join", 1000 + attempt);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(limiter.consume("socket-a", "lobby:join", 1010 + attempt)).toBe(
        "limited"
      );
    }

    expect(limiter.consume("socket-a", "lobby:join", 1014)).toBe("disconnect");
  });

  it("resets event and violation counts after the window expires", () => {
    const limiter = new SocketEventRateLimiter();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      limiter.consume("socket-a", "lobby:join", 1000 + attempt);
    }
    limiter.consume("socket-a", "lobby:join", 1008);

    expect(
      limiter.consume(
        "socket-a",
        "lobby:join",
        1000 + EVENT_WINDOW_MS
      )
    ).toBe("allowed");
  });

  it("tracks event categories independently and cleans socket state", () => {
    const limiter = new SocketEventRateLimiter();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      limiter.consume("socket-a", "lobby:join", 1000 + attempt);
    }

    expect(limiter.consume("socket-a", "game:move", 1008)).toBe("allowed");
    expect(limiter.size).toBe(1);
    limiter.clear("socket-a");
    expect(limiter.size).toBe(0);
  });

  it("limits connection handshakes by the direct peer address", () => {
    const limiter = new HandshakeRateLimiter();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(limiter.allow("127.0.0.1", attempt)).toBe(true);
    }
    expect(limiter.allow("127.0.0.1", 31)).toBe(false);
    expect(limiter.allow("127.0.0.2", 31)).toBe(true);
    expect(limiter.allow("127.0.0.1", EVENT_WINDOW_MS)).toBe(true);
  });

  it("bounds the number of tracked remote addresses", () => {
    const limiter = new HandshakeRateLimiter();

    for (let index = 0; index < 1024; index += 1) {
      expect(limiter.allow(`address-${index}`, 1_000)).toBe(true);
    }

    expect(limiter.allow("new-address", 1_000)).toBe(false);
    expect(limiter.allow("new-address", 11_000)).toBe(true);
  });
});
