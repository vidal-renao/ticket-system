import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import {
  canAssignTicket,
  canUpdateTicketStatus,
  getCurrentUserContext,
} from "@/lib/auth/permissions";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "resolved"],
  in_progress: ["open", "resolved"],
  resolved: ["closed", "open"],
  closed: [],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role === "customer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClientStatic();
  const { data: existing } = await svc
    .from("tickets")
    .select("id, status, organization_id, created_by, assigned_to")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId ?? "00000000-0000-0000-0000-000000000000")
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canUpdateTicketStatus(ctx, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.assigned_to !== undefined && !canAssignTicket(ctx, existing)) {
    return NextResponse.json({ error: "Only admins can assign tickets" }, { status: 403 });
  }

  if (
    ctx.role !== "admin" &&
    (body.priority !== undefined || body.category_id !== undefined || body.tags !== undefined)
  ) {
    return NextResponse.json({ error: "Only admins can update ticket metadata" }, { status: 403 });
  }

  if (body.status && body.status !== existing.status && ctx.role !== "admin") {
    const allowed = VALID_TRANSITIONS[existing.status as TicketStatus] ?? [];
    if (!allowed.includes(body.status as TicketStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${existing.status} -> ${body.status}` },
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
  if (patch.status === "closed") patch.closed_at = new Date().toISOString();

  const { data, error } = await svc
    .from("tickets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}
