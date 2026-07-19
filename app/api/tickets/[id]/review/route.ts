import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { canDecideTicketReview, canRequestTicketReview, type TicketReviewStatus } from "@/lib/ticket-workflow";
import { createTicketNotification, notifyOrgManagers } from "@/lib/notifications";
import { getAuthUserEmail, sendEmail, ticketEmailSubject } from "@/lib/email";

type ReviewAction = "request" | "approve" | "changes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const svc = createServiceClientStatic();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || !["agent", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: ReviewAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.action || !["request", "approve", "changes"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  }

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, ticket_number, title, created_by, assigned_to, organization_id, status, review_status")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reviewStatus = ticket.review_status as TicketReviewStatus;
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let auditAction: string;

  if (body.action === "request") {
    if (!canRequestTicketReview({ role: profile.role, actorId: user.id, assignedTo: ticket.assigned_to, status: ticket.status, reviewStatus })) {
      return NextResponse.json({ error: "Only the assigned agent can request review for work in progress" }, { status: 403 });
    }
    patch = {
      review_status: "pending",
      review_requested_at: now,
      review_requested_by: user.id,
      reviewed_at: null,
      reviewed_by: null,
    };
    auditAction = "ticket.review_requested";
  } else {
    if (!canDecideTicketReview(profile.role, reviewStatus)) {
      return NextResponse.json({ error: "Only an administrator can decide a pending review" }, { status: 403 });
    }
    const approved = body.action === "approve";
    patch = {
      review_status: approved ? "approved" : "changes_requested",
      reviewed_at: now,
      reviewed_by: user.id,
      status: approved ? "resolved" : "in_progress",
      resolved_at: approved ? now : null,
      closed_at: null,
    };
    auditAction = approved ? "ticket.review_approved" : "ticket.changes_requested";
  }

  const { data: updated, error } = await svc
    .from("tickets")
    .update(patch)
    .eq("id", ticket.id)
    .eq("organization_id", profile.organization_id)
    .eq("review_status", reviewStatus)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Review update failed" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Ticket changed; refresh and retry" }, { status: 409 });

  await svc.from("audit_logs").insert({
    organization_id: profile.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: auditAction,
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: { review_status: reviewStatus, status: ticket.status },
    new_values: { review_status: updated.review_status, status: updated.status },
  });

  if (body.action === "request") {
    // Administrators must know work is waiting for their OK.
    await notifyOrgManagers(profile.organization_id, {
      ticketId: ticket.id,
      type: "ticket.review_requested",
      title: "Ready for admin OK",
      message: `${formatTicketNumber(ticket.ticket_number)}: ${ticket.title} was submitted for review.`,
    });
  }

  const recipientId = body.action === "request" ? null : ticket.assigned_to;
  if (recipientId) {
    await createTicketNotification(svc, {
      userId: recipientId,
      ticketId: ticket.id,
      type: body.action === "approve" ? "ticket.resolved" : "ticket.changes_requested",
      title: body.action === "approve" ? "Work approved" : "Changes requested",
      message: `${formatTicketNumber(ticket.ticket_number)} review was ${body.action === "approve" ? "approved" : "returned for changes"}.`,
    });
  }

  if (body.action === "approve") {
    await createTicketNotification(svc, {
      userId: ticket.created_by,
      ticketId: ticket.id,
      type: "ticket.resolved",
      title: "Ticket resolved",
      message: `${formatTicketNumber(ticket.ticket_number)} has been resolved.`,
    });
    await sendEmail({
      to: await getAuthUserEmail(ticket.created_by),
      subject: ticketEmailSubject(ticket.ticket_number, ticket.title),
      text: `Your support ticket has been resolved.\n\n${formatTicketNumber(ticket.ticket_number)}: ${ticket.title}`,
    });
  }

  return NextResponse.json({ ticket: updated });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
