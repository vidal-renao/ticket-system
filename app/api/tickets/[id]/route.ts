import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowed = ["status", "priority", "category_id", "assigned_to", "tags"];
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Set resolved/closed timestamps
  if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
  if (patch.status === "closed") patch.closed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tickets")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}
