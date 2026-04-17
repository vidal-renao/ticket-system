"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
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

  // Auto-provision an organization for this admin if none exists yet.
  // Uses service role to bypass RLS (profile.organization_id is NULL so
  // the anon client cannot read/write organizations).
  let orgId = profile.organization_id;
  if (!orgId) {
    const svc = await createServiceClient();
    const domain = user.email?.split("@")[1] ?? "organization";
    const orgName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

    const { data: newOrg, error: orgError } = await svc
      .from("organizations")
      .insert({ name: orgName })
      .select("id")
      .single();

    if (orgError || !newOrg) return { error: `Cannot create organization: ${orgError?.message}` };

    const { error: profileError } = await svc
      .from("profiles")
      .update({ organization_id: newOrg.id })
      .eq("id", user.id);

    if (profileError) return { error: `Cannot link organization: ${profileError.message}` };

    orgId = newOrg.id;
  }

  // Read current settings to merge (preserve other keys)
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();

  const current =
    org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};

  // Use service client to bypass RLS when updating (RLS requires organization_id match)
  const svc = await createServiceClient();
  const { error } = await svc
    .from("organizations")
    .update({ settings: { ...current, pii_scrubbing_enabled: enabled } })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
