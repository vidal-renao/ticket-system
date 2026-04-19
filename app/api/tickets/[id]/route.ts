import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open:        ["in_progress", "resolved"],
  in_progress: ["open", "resolved"],
  resolved:    ["closed", "open"],
  closed:      [],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  // Service client bypasses RLS for trusted server-side operations
  const svc = createServiceClientStatic();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify ticket belongs to the agent's org — prevents cross-org writes
  const { data: existing } = await svc
    .from("tickets")
    .select("status, organization_id")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  // Validate status transition — admins can force any status
  const isAdmin = profile.role === "admin";
  if (body.status && body.status !== existing.status && !isAdmin) {
    const allowed = VALID_TRANSITIONS[existing.status as TicketStatus] ?? [];
    if (!allowed.includes(body.status as TicketStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${existing.status} → ${body.status}` },
        { status: 422 }
      );
    }
  }

  const allowed = ["status", "priority", "category_id", "assigned_to", "tags"];
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
  if (patch.status === "closed")   patch.closed_at   = new Date().toISOString();

  const { data, error } = await svc
    .from("tickets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}
