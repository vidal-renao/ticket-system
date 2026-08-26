import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const { data: adminProfile } = await svc
    .from("hd_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target belongs to same org
  const { data: targetProfile } = await svc
    .from("hd_profiles")
    .select("id, organization_id")
    .eq("id", targetId)
    .single();

  if (!targetProfile || targetProfile.organization_id !== adminProfile.organization_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // is_active is deliberately not here any more. It is now one half of the
  // frozen state -- the other half is the ban in GoTrue -- and setting it
  // alone would recreate exactly the split this feature closed: an account
  // out of routing that can still sign in. POST .../freeze owns it.
  const allowed = ["role", "specialty"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (targetId === user.id) {
    delete updates.role;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (updates.role !== undefined && !["admin", "manager", "agent", "customer"].includes(String(updates.role))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (updates.specialty !== undefined && typeof updates.specialty !== "string") {
    return NextResponse.json({ error: "Invalid specialty" }, { status: 400 });
  }

  const { error } = await svc
    .from("hd_profiles")
    .update(updates)
    .eq("id", targetId)
    .eq("organization_id", adminProfile.organization_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
