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
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target belongs to same org
  const { data: targetProfile } = await svc
    .from("profiles")
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

  const allowed = ["role", "specialty", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (targetId === user.id) {
    delete updates.role;
    delete updates.is_active;
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
  if (updates.is_active !== undefined && typeof updates.is_active !== "boolean") {
    return NextResponse.json({ error: "Invalid account status" }, { status: 400 });
  }

  const { error } = await svc
    .from("profiles")
    .update(updates)
    .eq("id", targetId)
    .eq("organization_id", adminProfile.organization_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
