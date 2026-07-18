import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import { resolveTicketAccess } from "@/lib/ticket-visibility";
import type { Database } from "@/lib/supabase/types";
import {
  canonicalToLegacyStatus,
  legacyToCanonicalStatus,
  normalizeStatusInput,
  validateTicketTransition,
} from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { applySlaAssessment, ensureSlaDeadlines } from "@/lib/sla";
import { createTicketNotification } from "@/lib/notifications";
import { getAuthUserEmail, sendEmail, ticketEmailSubject } from "@/lib/email";
import { canAgentSetExecutionStatus } from "@/lib/ticket-workflow";

export async function POST(request: Request) {
  const supabase = await createClient();
  const svc = createServiceClientStatic();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    ticket_id?: string;
    content?: string;
    is_internal?: boolean;
    status_after_comment?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticket_id, content, is_internal = false } = body;
  if (!ticket_id || !content?.trim()) {
    return NextResponse.json(
      { error: "ticket_id and content are required" },
      { status: 400 }
    );
  }

  const isStaff = isStaffRole(profile.role);

  const access = await resolveTicketAccess<Database["public"]["Tables"]["tickets"]["Row"]>(
    svc,
    profile,
    ticket_id,
    "id, ticket_number, title, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at"
  );

  if (access.kind === "not_found") {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (access.kind === "forbidden") {
    return NextResponse.json({ error: "Access restricted" }, { status: 403 });
  }

  const ticket = access.ticket;

  const requestedStatus = body.status_after_comment
    ? normalizeStatusInput(body.status_after_comment)
    : null;

  if (body.status_after_comment && !requestedStatus) {
    return NextResponse.json({ error: "Invalid ticket status" }, { status: 400 });
  }

  if (requestedStatus && (!isStaff || is_internal)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedLegacyStatus = requestedStatus ? canonicalToLegacyStatus(requestedStatus) : null;
  if (requestedLegacyStatus && profile.role === "manager") {
    return NextResponse.json({ error: "Managers have read-only workflow access" }, { status: 403 });
  }
  if (requestedLegacyStatus && profile.role === "agent" && !canAgentSetExecutionStatus(ticket.status, requestedLegacyStatus)) {
    return NextResponse.json({ error: "Agents cannot perform that status transition" }, { status: 403 });
  }
  if (requestedLegacyStatus === "resolved") {
    return NextResponse.json({ error: "Resolution requires administrator approval" }, { status: 409 });
  }

  if (requestedStatus) {
    const transition = validateTicketTransition(ticket, {
      status: canonicalToLegacyStatus(requestedStatus),
      assigned_to: ticket.assigned_to,
    });

    if (!transition.ok) {
      return NextResponse.json({ error: transition.error }, { status: 422 });
    }
  }

  const { data: comment, error } = await svc
    .from("ticket_comments")
    .insert({
      ticket_id,
      author_id: user.id,
      content: content.trim(),
      is_internal: isStaff && is_internal,
    })
    .select("*, profiles(full_name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!is_internal) {
    const recipientId = isStaff ? ticket.created_by : ticket.assigned_to;
    if (recipientId && recipientId !== user.id) {
      await createTicketNotification(svc, {
        userId: recipientId,
        ticketId: ticket_id,
        type: "comment.public",
        title: "New ticket comment",
        message: `${formatTicketNumber(ticket.ticket_number)} has a new public comment.`,
      });
    }

    if (isStaff) {
      await sendEmail({
        to: await getAuthUserEmail(ticket.created_by),
        subject: ticketEmailSubject(ticket.ticket_number, ticket.title),
        text: `There is a new reply on your support ticket.\n\n${content.trim()}`,
      });
    }
  }

  let slaTicket = await ensureSlaDeadlines(svc, ticket);
  if (isStaff && !is_internal && !ticket.first_response_at && !ticket.first_agent_response_at) {
    const firstResponseAt = new Date().toISOString();
    const { data: updatedFirstResponse, error: firstResponseError } = await svc
      .from("tickets")
      .update({
        first_response_at: firstResponseAt,
        first_agent_response_at: firstResponseAt,
      })
      .eq("id", ticket_id)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .select("id, ticket_number, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
      .single();

    if (firstResponseError) return NextResponse.json({ error: firstResponseError.message }, { status: 500 });
    slaTicket = updatedFirstResponse;
  }

  if (requestedStatus) {
    const nextLegacyStatus = canonicalToLegacyStatus(requestedStatus);
    const { data: updatedTicket, error: ticketError } = await svc
      .from("tickets")
      .update({ status: nextLegacyStatus })
      .eq("id", ticket_id)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .select("id, ticket_number, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
      .single();

    if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 });

    await logTicketLifecycleEvents({
      ticketId: ticket_id,
      organizationId: profile.organization_id,
      actorId: user.id,
      actorRole: profile.role,
      oldStatus: legacyToCanonicalStatus(ticket.status, ticket.assigned_to),
      newStatus: legacyToCanonicalStatus(updatedTicket.status, updatedTicket.assigned_to),
      oldAssignee: ticket.assigned_to,
      newAssignee: updatedTicket.assigned_to,
    });

    slaTicket = updatedTicket;
  }

  await applySlaAssessment(svc, slaTicket, user.id, profile.role);

  return NextResponse.json({ comment }, { status: 201 });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
