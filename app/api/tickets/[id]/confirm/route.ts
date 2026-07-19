import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { createTicketNotification, notifyOrgManagers } from "@/lib/notifications";
import { legacyToCanonicalStatus, validateTicketTransition } from "@/lib/ticket-lifecycle";

/**
 * Final step of the ticket chain of custody: the company that opened the
 * ticket confirms the administrator-approved resolution and the ticket is
 * closed. Only the ticket creator (customer) — or an administrator closing on
 * the customer's behalf — may confirm, and only from `resolved`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || !["customer", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, ticket_number, title, organization_id, created_by, status, assigned_to, review_status")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (profile.role === "customer" && ticket.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (ticket.status !== "resolved") {
    return NextResponse.json({ error: "Only resolved tickets can be confirmed" }, { status: 409 });
  }

  const transition = validateTicketTransition(ticket, {
    status: "closed",
    assigned_to: ticket.assigned_to,
  });
  if (!transition.ok) {
    return NextResponse.json({ error: transition.error }, { status: 422 });
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await svc
    .from("tickets")
    .update({ status: "closed", closed_at: now })
    .eq("id", ticket.id)
    .eq("organization_id", profile.organization_id)
    .eq("status", "resolved")
    .is("deleted_at", null)
    .select("id, status, assigned_to")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Confirmation failed" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Ticket changed; refresh and retry" }, { status: 409 });

  await logTicketLifecycleEvents({
    ticketId: ticket.id,
    organizationId: ticket.organization_id,
    actorId: user.id,
    actorRole: profile.role,
    oldStatus: legacyToCanonicalStatus("resolved", ticket.assigned_to),
    newStatus: "closed",
    oldAssignee: ticket.assigned_to,
    newAssignee: ticket.assigned_to,
  });

  await svc.from("ticket_audit_logs").insert({
    organization_id: ticket.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: "ticket.customer_confirmed",
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: { status: "resolved" },
    new_values: { status: "closed", closed_at: now },
  });

  const ref = formatTicketNumber(ticket.ticket_number);
  if (ticket.assigned_to) {
    await createTicketNotification(svc, {
      userId: ticket.assigned_to,
      ticketId: ticket.id,
      type: "ticket.closed",
      title: "Resolution confirmed",
      message: `${ref} — the customer confirmed the resolution. Ticket closed.`,
    });
  }
  await notifyOrgManagers(ticket.organization_id, {
    ticketId: ticket.id,
    type: "ticket.closed",
    title: "Customer confirmed resolution",
    message: `${ref}: ${ticket.title} was confirmed by the customer and is now closed.`,
  });

  return NextResponse.json({ ok: true });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
