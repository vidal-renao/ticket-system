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

/** Create a new routing team. Admin only. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Team name is required (max 60 characters)" }, { status: 400 });
  }

  const { data: existing } = await svc
    .from("teams")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .ilike("name", name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A team with that name already exists" }, { status: 409 });
  }

  const { data: team, error } = await svc
    .from("teams")
    .insert({
      organization_id: profile.organization_id,
      name,
      description: body.description?.trim() || null,
      is_active: true,
    })
    .select("id, name")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create team" }, { status: 500 });

  return NextResponse.json({ team }, { status: 201 });
}
