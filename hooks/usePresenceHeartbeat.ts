"use client";

import { useEffect } from "react";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";

/**
 * Proves this session is alive by pinging /api/profile/heartbeat once per
 * minute while the tab is visible. Server-side presence downgrades anyone
 * whose last heartbeat is older than 3 minutes, so stale "online" statuses
 * disappear on their own.
 */
export function usePresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function beat() {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        await fetch("/api/profile/heartbeat", { method: "POST", cache: "no-store" });
      } catch {
        // Network hiccup — the next interval retries.
      }
    }

    beat();
    const interval = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
