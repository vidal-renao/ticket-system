import type { AvailabilityStatus } from "@/lib/supabase/types";

/**
 * Presence is trusted only when the client has recently proven it is alive.
 * The app shell sends a heartbeat every HEARTBEAT_INTERVAL_MS; a declared
 * "online"/"busy" status older than PRESENCE_STALE_MS is downgraded to
 * "offline" so closed laptops and abandoned tabs never look connected.
 */
export const HEARTBEAT_INTERVAL_MS = 60_000;
export const PRESENCE_STALE_MS = 3 * 60_000;

export type EffectivePresence = "online" | "busy" | "offline";

/**
 * Resolve the presence to display for a user.
 *
 * @param status   Self-declared availability from `profiles.availability_status`.
 * @param lastSeen `profiles.last_seen_at`. Pass `undefined` when the value is
 *                 unknown (pre-migration schema) — the declared status is then
 *                 trusted as-is. `null` means the user has never sent a
 *                 heartbeat and is treated as offline.
 */
export function effectivePresence(
  status: AvailabilityStatus | string | null | undefined,
  lastSeen?: string | null,
  now: number = Date.now()
): EffectivePresence {
  if (status !== "online" && status !== "busy") return "offline";
  if (lastSeen === undefined) return status;
  if (!lastSeen) return "offline";
  const seen = new Date(lastSeen).getTime();
  if (!Number.isFinite(seen) || now - seen > PRESENCE_STALE_MS) return "offline";
  return status;
}

export function isEffectivelyOnline(
  status: AvailabilityStatus | string | null | undefined,
  lastSeen?: string | null,
  now: number = Date.now()
): boolean {
  return effectivePresence(status, lastSeen, now) !== "offline";
}

/** Human label for how long ago someone was last seen. */
export function formatLastSeen(lastSeen: string | null | undefined, now: number = Date.now()): string {
  if (!lastSeen) return "Never connected";
  const diff = now - new Date(lastSeen).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "Just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
