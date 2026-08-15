import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getAuditSummary } from "@/lib/ops/audit-source";

export const dynamic = "force-dynamic";

/**
 * SLA audit deliveries for the /ops console.
 *
 * `public.audit_runs` is readable by `service_role` only, so this route is the
 * single browser-facing door to it. Access is gated exactly like the console
 * itself: an authenticated manager/admin, scoped to their own organization —
 * the caller never gets to choose which organization is read.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("hd_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!profile.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const summary = await getAuditSummary(profile.organization_id);
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
