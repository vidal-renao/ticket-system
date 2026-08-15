import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { createTicketNotification } from "@/lib/notifications";
import { legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import {
  canForceClose,
  reviewStatusAfterForceClose,
  validateForceCloseReason,
  FORCE_CLOSE_REASON_MIN,
  FORCE_CLOSE_REASON_MAX,
} from "@/lib/force-close";

/**
 * Emergency exit from the chain of custody.
 *
 * An administrator can close a ticket from any state, skipping Execution,
 * Admin OK and the customer's confirmation. It exists for the cases the normal
 * flow cannot express -- a duplicate, a ticket opened by mistake, an agent who
 * left the company mid-execution -- and for nothing else.
 *
 * It is a separate route rather than a relaxation of PATCH /api/tickets/[id]
 * on purpose. That route refuses to let an admin set `resolved` without an
 * approved review, and `validateTicketTransition` only allows one step along
 * the graph at a time; both rules stay exactly as they are for every other
 * caller. Bypassing the flow is possible only here, only for an admin, and
 * only while writing down why.
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

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateForceCloseReason(body.reason);
  if (!validated.ok) {
    const message =
      validated.error === "reason_too_long"
        ? `Reason must be at most ${FORCE_CLOSE_REASON_MAX} characters`
        : `A reason of at least ${FORCE_CLOSE_REASON_MIN} characters is required to force-close a ticket`;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { reason } = validated;

  const { data: ticket } = await svc
    .from("hd_tickets")
    .select("id, ticket_number, title, organization_id, created_by, status, assigned_to, review_status, resolved_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (!canForceClose(ticket.status)) {
    return NextResponse.json({ error: "Ticket is already closed" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const nextReviewStatus = reviewStatusAfterForceClose(ticket.review_status);

  const { data: updated, error } = await svc
    .from("hd_tickets")
    .update({
      status: "closed",
      closed_at: now,
      // Kept if the ticket had already been resolved, so the resolution time
      // reported for it is not rewritten by the forced close.
      resolved_at: ticket.resolved_at ?? now,
      ...(nextReviewStatus ? { review_status: nextReviewStatus } : {}),
    })
    .eq("id", ticket.id)
    .eq("organization_id", profile.organization_id)
    // Guards against two admins forcing the same ticket at once: the second
    // update matches nothing and reports a conflict instead of writing a
    // second audit entry for a close that already happened.
    .neq("status", "closed")
    .is("deleted_at", null)
    .select("id, ticket_number, status, assigned_to")
    .maybeSingle();

  if (error) {
    console.error("[force-close]", error);
    return NextResponse.json({ error: "Could not close the ticket" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Ticket changed; refresh and retry" }, { status: 409 });
  }

  // The ordinary lifecycle entry, so the ticket's timeline has no gap where
  // the status changed without an event.
  await logTicketLifecycleEvents({
    ticketId: ticket.id,
    organizationId: ticket.organization_id,
    actorId: user.id,
    actorRole: profile.role,
    oldStatus: legacyToCanonicalStatus(ticket.status, ticket.assigned_to),
    newStatus: "closed",
    oldAssignee: ticket.assigned_to,
    newAssignee: ticket.assigned_to,
  });

  // The entry that makes this act distinguishable from a normal transition:
  // a dedicated action *and* an explicit flag inside the payload, so it can be
  // found either way. The reason rides in the same row.
  const { error: auditError } = await svc.from("hd_ticket_audit_logs").insert({
    organization_id: ticket.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: "ticket.force_closed",
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: { status: ticket.status, review_status: ticket.review_status },
    new_values: {
      status: "closed",
      forced: true,
      reason,
      closed_at: now,
      ...(nextReviewStatus ? { review_status: nextReviewStatus } : {}),
    },
  });

  if (auditError) {
    // The close already happened; failing the response now would tell the admin
    // it did not. Log loudly instead — an unaudited force-close is the one
    // thing this feature must never do quietly.
    console.error("[force-close] audit entry failed", {
      ticketId: ticket.id,
      actorId: user.id,
      error: auditError.message,
    });
  }

  if (ticket.assigned_to && ticket.assigned_to !== user.id) {
    await createTicketNotification(svc, {
      userId: ticket.assigned_to,
      ticketId: ticket.id,
      type: "ticket.force_closed",
      title: "Ticket closed by an administrator",
      message: `An admin closed ${formatTicketNumber(updated.ticket_number)} directly. Reason: ${reason}`,
    });
  }

  return NextResponse.json({ ok: true, audited: !auditError });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "the ticket";
}
