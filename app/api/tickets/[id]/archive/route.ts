import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";

/**
 * Move a finished (resolved/closed) ticket into the History archive, or
 * restore it back to the operational lists. Administrator only. Archiving is
 * reversible and audited — it never destroys data.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: "archive" | "restore" };
  try {
    body = await request.json();
  } catch {
    body = { action: "archive" };
  }
  const action = body.action ?? "archive";
  if (!["archive", "restore"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: ticket } = await svc
    .from("hd_tickets")
    .select("id, ticket_number, status, archived_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (action === "archive") {
    if (!["resolved", "closed"].includes(ticket.status)) {
      return NextResponse.json({ error: "Only resolved or closed tickets can be archived" }, { status: 409 });
    }
    if (ticket.archived_at) {
      return NextResponse.json({ ok: true, alreadyArchived: true });
    }
  }

  const now = new Date().toISOString();
  const patch =
    action === "archive"
      ? { archived_at: now, archived_by: user.id }
      : { archived_at: null, archived_by: null };

  const { error } = await svc
    .from("hd_tickets")
    .update(patch)
    .eq("id", ticket.id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: "Archive update failed" }, { status: 500 });

  await svc.from("hd_ticket_audit_logs").insert({
    organization_id: profile.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: action === "archive" ? "ticket.archived" : "ticket.unarchived",
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: { archived_at: ticket.archived_at },
    new_values: patch,
  });

  return NextResponse.json({ ok: true });
}
