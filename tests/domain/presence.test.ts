import { describe, expect, it } from "vitest";
import {
  effectivePresence,
  formatLastSeen,
  isEffectivelyOnline,
  PRESENCE_STALE_MS,
} from "../../lib/presence";

const NOW = Date.parse("2026-07-19T12:00:00Z");
const fresh = new Date(NOW - 30_000).toISOString();
const stale = new Date(NOW - PRESENCE_STALE_MS - 1_000).toISOString();

describe("heartbeat-verified presence", () => {
  it("trusts a declared online status only with a recent heartbeat", () => {
    expect(effectivePresence("online", fresh, NOW)).toBe("online");
    expect(effectivePresence("busy", fresh, NOW)).toBe("busy");
  });

  it("downgrades stale or missing heartbeats to offline", () => {
    expect(effectivePresence("online", stale, NOW)).toBe("offline");
    expect(effectivePresence("busy", stale, NOW)).toBe("offline");
    expect(effectivePresence("online", null, NOW)).toBe("offline");
  });

  it("never promotes a declared offline status", () => {
    expect(effectivePresence("offline", fresh, NOW)).toBe("offline");
    expect(effectivePresence(null, fresh, NOW)).toBe("offline");
    expect(effectivePresence(undefined, fresh, NOW)).toBe("offline");
  });

  it("falls back to the declared status when last_seen_at is unknown (pre-migration)", () => {
    expect(effectivePresence("online", undefined, NOW)).toBe("online");
    expect(effectivePresence("busy", undefined, NOW)).toBe("busy");
  });

  it("treats malformed timestamps as offline", () => {
    expect(effectivePresence("online", "not-a-date", NOW)).toBe("offline");
  });

  it("exposes a boolean helper for online/busy", () => {
    expect(isEffectivelyOnline("online", fresh, NOW)).toBe(true);
    expect(isEffectivelyOnline("busy", fresh, NOW)).toBe(true);
    expect(isEffectivelyOnline("online", stale, NOW)).toBe(false);
  });

  it("formats last-seen labels for humans", () => {
    expect(formatLastSeen(null, NOW)).toBe("Never connected");
    expect(formatLastSeen(new Date(NOW - 20_000).toISOString(), NOW)).toBe("Just now");
    expect(formatLastSeen(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5 min ago");
    expect(formatLastSeen(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatLastSeen(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d ago");
  });
});
