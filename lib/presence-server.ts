import type { createServiceClientStatic } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClientStatic>;

/**
 * Fetch `last_seen_at` for a set of users. Queried separately from the main
 * profile selects so environments that have not applied
 * `docs/migration_presence_heartbeat.sql` degrade gracefully: on any error an
 * empty map is returned and callers fall back to the declared status.
 */
export async function getLastSeenMap(
  svc: ServiceClient,
  userIds: string[]
): Promise<Record<string, string | null>> {
  if (!userIds.length) return {};
  const { data, error } = await svc
    .from("profiles")
    .select("id, last_seen_at")
    .in("id", userIds);
  if (error || !data) return {};
  return Object.fromEntries(
    (data as { id: string; last_seen_at: string | null }[]).map((row) => [
      row.id,
      row.last_seen_at ?? null,
    ])
  );
}
