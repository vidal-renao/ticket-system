import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || !isStaffRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: teams, error } = await svc
    .from("teams")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: "Unable to load teams" }, { status: 500 });
  }

  return NextResponse.json({ teams: teams ?? [] });
}
