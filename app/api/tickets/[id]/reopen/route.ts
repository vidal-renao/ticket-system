import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { createTicketNotification } from "@/lib/notifications";

const REOPEN_WINDOW_HOURS = 48;

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
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, ticket_number, organization_id, created_by, status, resolved_at, assigned_to")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Customers can only reopen their own tickets within the 48h window
  if (profile.role === "customer") {
    if (ticket.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (ticket.status !== "resolved") {
      return NextResponse.json({ error: "Ticket is not resolved" }, { status: 409 });
    }
    if (!ticket.resolved_at) {
      return NextResponse.json({ error: "Ticket has no resolved_at timestamp" }, { status: 409 });
    }
    const hoursSince = (Date.now() - new Date(ticket.resolved_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince > REOPEN_WINDOW_HOURS) {
      return NextResponse.json(
        { error: `Reopen window (${REOPEN_WINDOW_HOURS}h) has expired` },
        { status: 409 }
      );
    }
  }

  const oldStatus = ticket.status;

  const { error } = await svc
    .from("tickets")
    .update({ status: "open", resolved_at: null, sla_breached: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to reopen ticket" }, { status: 500 });
  }

  await logTicketLifecycleEvents({
    ticketId: id,
    organizationId: ticket.organization_id,
    actorId: user.id,
    actorRole: profile.role,
    oldStatus,
    newStatus: "open",
    oldAssignee: ticket.assigned_to,
    newAssignee: ticket.assigned_to,
  });

  if (ticket.assigned_to) {
    await createTicketNotification(svc, {
      userId: ticket.assigned_to,
      ticketId: id,
      type: "ticket.reopened",
      title: "Ticket reopened by customer",
      message: `TK-${String(ticket.ticket_number).padStart(4, "0")} has been reopened.`,
    });
  }

  return NextResponse.json({ ok: true });
}
