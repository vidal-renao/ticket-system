import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import {
  canonicalToLegacyStatus,
  legacyToCanonicalStatus,
  normalizeStatusInput,
  validateTicketTransition,
} from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { applySlaAssessment, buildSlaDeadlinePatch, ensureSlaDeadlines, getSlaPolicyForTicket } from "@/lib/sla";
import { createTicketNotification } from "@/lib/notifications";
import { getAuthUserEmail, sendEmail, ticketEmailSubject } from "@/lib/email";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile || !isStaffRole(profile.role) || !profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("tickets")
    .select("id, ticket_number, title, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const requestedStatus = body.status === undefined ? null : normalizeStatusInput(body.status);
  if (body.status !== undefined && !requestedStatus) {
    return NextResponse.json({ error: "Invalid ticket status" }, { status: 400 });
  }

  const allowed = ["status", "priority", "category_id", "assigned_to", "tags"];
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (requestedStatus) {
    patch.status = canonicalToLegacyStatus(requestedStatus);
  }

  if (patch.assigned_to) {
    const svc = createServiceClientStatic();
    const { data: assignee } = await svc
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", patch.assigned_to as string)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!assignee || !isStaffRole(assignee.role)) {
      return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    }
  }

  if (patch.priority && patch.priority !== existing.priority) {
    const policy = await getSlaPolicyForTicket(
      supabase,
      profile.organization_id,
      patch.priority as string
    );
    Object.assign(
      patch,
      buildSlaDeadlinePatch(
        {
          ...existing,
          priority: patch.priority as string,
          status: (patch.status as string | undefined) ?? existing.status,
        },
        policy,
        { preserveExisting: false }
      )
    );
  }

  const nextState = {
    status: (patch.status as string | undefined) ?? existing.status,
    assigned_to:
      patch.assigned_to === undefined
        ? existing.assigned_to
        : ((patch.assigned_to as string | null) || null),
  };

  const transition = validateTicketTransition(existing, nextState);
  if (!transition.ok) {
    return NextResponse.json({ error: transition.error }, { status: 422 });
  }

  const now = new Date().toISOString();
  if (patch.status === "resolved") patch.resolved_at = now;
  if (patch.status === "closed") patch.closed_at = now;
  if (patch.status === "in_progress") patch.closed_at = null;

  const { data, error } = await supabase
    .from("tickets")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .select("*, response_due_at, resolution_due_at, first_agent_response_at, sla_response_breached, sla_resolution_breached")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTicketLifecycleEvents({
    ticketId: id,
    organizationId: profile.organization_id,
    actorId: user.id,
    actorRole: profile.role,
    oldStatus: legacyToCanonicalStatus(existing.status, existing.assigned_to),
    newStatus: legacyToCanonicalStatus(data.status, data.assigned_to),
    oldAssignee: existing.assigned_to,
    newAssignee: data.assigned_to,
  });

  if (existing.assigned_to !== data.assigned_to && data.assigned_to) {
    await createTicketNotification(supabase, {
      userId: data.assigned_to,
      ticketId: id,
      type: "ticket.assigned",
      title: "Ticket assigned",
      message: `${formatTicketNumber(data.ticket_number)} was assigned to you.`,
    });
  }

  if (existing.status !== data.status && data.status === "resolved") {
    await createTicketNotification(supabase, {
      userId: data.created_by,
      ticketId: id,
      type: "ticket.resolved",
      title: "Ticket resolved",
      message: `${formatTicketNumber(data.ticket_number)} has been resolved.`,
    });

    await sendEmail({
      to: await getAuthUserEmail(data.created_by),
      subject: ticketEmailSubject(data.ticket_number, data.title),
      text: `Your support ticket has been resolved.\n\n${formatTicketNumber(data.ticket_number)}: ${data.title}`,
    });
  }

  const slaTicket = await ensureSlaDeadlines(supabase, data);
  await applySlaAssessment(supabase, slaTicket, user.id, profile.role);

  return NextResponse.json({ ticket: data });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
