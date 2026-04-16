"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface OrgSettings {
  pii_scrubbing_enabled: boolean;
}

function parseSettings(raw: unknown): OrgSettings {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      pii_scrubbing_enabled:
        (raw as Record<string, unknown>).pii_scrubbing_enabled === true,
    };
  }
  return { pii_scrubbing_enabled: false };
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { pii_scrubbing_enabled: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return { pii_scrubbing_enabled: false };

  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", profile.organization_id)
    .single();

  return parseSettings(org?.settings);
}

export async function setPiiScrubbing(
  enabled: boolean
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden: admin only" };
  if (!profile.organization_id) return { error: "No organization" };

  // Read current settings to merge (preserve other keys)
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", profile.organization_id)
    .single();

  const current =
    org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...current, pii_scrubbing_enabled: enabled } })
    .eq("id", profile.organization_id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
