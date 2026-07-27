import type { SupabaseClient } from "@supabase/supabase-js";

// The canonical, single tenant this deployment serves. Identified by the
// stable, already-unique `slug` column -- never by the mutable display
// `name`, and never hardcoded as a UUID in frontend code (see DECISIONS.md
// ADR-015). Server-only: nothing here is imported by a client component.
const CANONICAL_ORGANIZATION_SLUG = "vidal-real-estate";

export async function getCanonicalOrganizationId(
  svc: SupabaseClient
): Promise<string | null> {
  const { data, error } = await svc
    .from("organizations")
    .select("id")
    .eq("slug", CANONICAL_ORGANIZATION_SLUG)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
