export const EVENT_WINDOW_MS = 10_000;

const MAX_EVENTS_PER_WINDOW = 180;
const EVENT_LIMITS: Record<string, number> = {
  "lobby:join": 8,
  "lobby:ready": 20,
  "game:move": 80,
  "game:attack": 50,
  "game:restart": 4,
};
const DISCONNECT_AFTER_VIOLATIONS = 5;
const MAX_HANDSHAKES_PER_IP = 30;
const MAX_TRACKED_ADDRESSES = 1024;

type EventWindow = {
  startedAt: number;
  total: number;
  events: Map<string, number>;
  violations: number;
};

export type EventRateDecision = "allowed" | "limited" | "disconnect";

export class SocketEventRateLimiter {
  private readonly windows = new Map<string, EventWindow>();

  consume(
    socketId: string,
    eventName: string,
    now = Date.now()
  ): EventRateDecision {
    let window = this.windows.get(socketId);

    if (!window || now - window.startedAt >= EVENT_WINDOW_MS) {
      window = {
        startedAt: now,
        total: 0,
        events: new Map(),
        violations: 0,
      };
      this.windows.set(socketId, window);
    }

    const eventCount = window.events.get(eventName) ?? 0;
    const overGlobalLimit = window.total >= MAX_EVENTS_PER_WINDOW;
    const eventLimit = EVENT_LIMITS[eventName];
    const overEventLimit = eventLimit !== undefined && eventCount >= eventLimit;

    if (overGlobalLimit || overEventLimit) {
      window.violations += 1;
      return window.violations >= DISCONNECT_AFTER_VIOLATIONS
        ? "disconnect"
        : "limited";
    }

    window.total += 1;
    window.events.set(eventName, eventCount + 1);
    return "allowed";
  }

  clear(socketId: string) {
    this.windows.delete(socketId);
  }

  get size() {
    return this.windows.size;
  }
}

type HandshakeWindow = {
  startedAt: number;
  count: number;
};

export class HandshakeRateLimiter {
  private readonly windows = new Map<string, HandshakeWindow>();

  allow(remoteAddress: string, now = Date.now()) {
    if (this.windows.size >= MAX_TRACKED_ADDRESSES) {
      for (const [address, window] of this.windows) {
        if (now - window.startedAt >= EVENT_WINDOW_MS) {
          this.windows.delete(address);
        }
      }

      if (
        !this.windows.has(remoteAddress) &&
        this.windows.size >= MAX_TRACKED_ADDRESSES
      ) {
        return false;
      }
    }

    let window = this.windows.get(remoteAddress);

    if (!window || now - window.startedAt >= EVENT_WINDOW_MS) {
      window = { startedAt: now, count: 0 };
      this.windows.set(remoteAddress, window);
    }

    if (window.count >= MAX_HANDSHAKES_PER_IP) {
      return false;
    }

    window.count += 1;
    return true;
  }
}
