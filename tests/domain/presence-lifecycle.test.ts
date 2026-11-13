import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { effectivePresence, HEARTBEAT_INTERVAL_MS, PRESENCE_STALE_MS } from "../../lib/presence";

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const clientSources = ["components", "hooks", "app"]
  .flatMap((dir) => sourceFiles(join(ROOT, dir)))
  .filter((path) => !relative(ROOT, path).startsWith(join("app", "api")));

describe("declared presence is only changed deliberately", () => {
  // Regression: AppShell sent /api/profile/offline on `beforeunload`, which
  // also fires on reload and full-page navigation. The declared status became
  // "offline" while the heartbeat kept running, so an active agent showed as
  // Offline on the ticket page and in /admin until their next login.
  it("no client code marks the profile offline from a page-unload event", () => {
    const offenders = clientSources.filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        source.includes("/api/profile/offline") &&
        /addEventListener\(\s*["'](beforeunload|unload|pagehide)["']/.test(source)
      );
    });
    expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
  });

  it("only the inactivity sign-out uses the offline beacon", () => {
    const callers = clientSources
      .filter((path) => readFileSync(path, "utf8").includes("/api/profile/offline"))
      .map((path) => relative(ROOT, path));
    expect(callers).toEqual([join("components", "layout", "SessionTimeoutModal.tsx")]);
  });
});

describe("heartbeat window", () => {
  const NOW = Date.parse("2026-11-13T22:30:00Z");

  it("keeps a working agent online across a missed beat", () => {
    // Two intervals without a beat (e.g. a reload in between) stay inside the window.
    const lastSeen = new Date(NOW - 2 * HEARTBEAT_INTERVAL_MS).toISOString();
    expect(effectivePresence("online", lastSeen, NOW)).toBe("online");
  });

  it("drops a closed tab to offline once the window passes, without any beacon", () => {
    const lastSeen = new Date(NOW - PRESENCE_STALE_MS - 1).toISOString();
    expect(effectivePresence("online", lastSeen, NOW)).toBe("offline");
  });
});
