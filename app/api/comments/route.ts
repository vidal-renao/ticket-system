import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(supabase, user.id);
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

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, ticket_number, title, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
    .eq("id", ticket_id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (profile.role === "agent" && ticket.assigned_to && ticket.assigned_to !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedStatus = body.status_after_comment
    ? normalizeStatusInput(body.status_after_comment)
    : null;

  if (body.status_after_comment && !requestedStatus) {
    return NextResponse.json({ error: "Invalid ticket status" }, { status: 400 });
  }

  if (requestedStatus && (!isStaff || is_internal)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const { data: comment, error } = await supabase
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
      await createTicketNotification(supabase, {
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

  let slaTicket = await ensureSlaDeadlines(supabase, ticket);
  if (isStaff && !is_internal && !ticket.first_response_at && !ticket.first_agent_response_at) {
    const firstResponseAt = new Date().toISOString();
    const { data: updatedFirstResponse, error: firstResponseError } = await supabase
      .from("tickets")
      .update({
        first_response_at: firstResponseAt,
        first_agent_response_at: firstResponseAt,
      })
      .eq("id", ticket_id)
      .eq("organization_id", profile.organization_id)
      .select("id, ticket_number, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
      .single();

    if (firstResponseError) return NextResponse.json({ error: firstResponseError.message }, { status: 500 });
    slaTicket = updatedFirstResponse;
  }

  if (requestedStatus) {
    const nextLegacyStatus = canonicalToLegacyStatus(requestedStatus);
    const { data: updatedTicket, error: ticketError } = await supabase
      .from("tickets")
      .update({ status: nextLegacyStatus })
      .eq("id", ticket_id)
      .eq("organization_id", profile.organization_id)
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

  await applySlaAssessment(supabase, slaTicket, user.id, profile.role);

  return NextResponse.json({ comment }, { status: 201 });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
