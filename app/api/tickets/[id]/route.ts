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
  const { id: rawId } = await params;
  const normalizedTicketNumber = parseTicketIdentifier(rawId);
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile || !isStaffRole(profile.role) || !profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseSelect =
    "id, ticket_number, title, created_by, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at";

  let existing:
    | {
        id: string;
        ticket_number: number | null;
        title: string;
        created_by: string;
        organization_id: string;
        priority: string;
        status: string;
        assigned_to: string | null;
        created_at: string;
        resolved_at: string | null;
        first_response_at: string | null;
        first_agent_response_at: string | null;
        sla_first_response_due: string | null;
        sla_resolution_due: string | null;
        response_due_at: string | null;
        resolution_due_at: string | null;
      }
    | null = null;

  const { data: byId, error: existingError } = await svc
    .from("tickets")
    .select(baseSelect)
    .eq("id", rawId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  existing = byId;

  if (!existing && normalizedTicketNumber !== null) {
    const { data: byTicketNumber, error: numberLookupError } = await svc
      .from("tickets")
      .select(baseSelect)
      .eq("ticket_number", normalizedTicketNumber)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (numberLookupError) {
      console.error("[PATCH /api/tickets/[id]] numeric ticket lookup failed", {
        ticketIdentifier: rawId,
        actorId: user.id,
        role: profile.role,
        organizationId: profile.organization_id,
        error: numberLookupError.message,
      });
    }

    existing = byTicketNumber;
  }

  if (existingError) {
    console.error("[PATCH /api/tickets/[id]] existing ticket lookup failed", {
      ticketId: rawId,
      actorId: user.id,
      role: profile.role,
      organizationId: profile.organization_id,
      error: existingError.message,
    });
  }

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (profile.role === "agent" && existing.assigned_to && existing.assigned_to !== user.id) {
    return NextResponse.json({ error: "Access restricted" }, { status: 403 });
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

  if (profile.role === "agent" && patch.assigned_to !== undefined) {
    const requestedAssignee = (patch.assigned_to as string | null) || null;
    if (requestedAssignee !== user.id) {
      return NextResponse.json({ error: "Agents can only assign tickets to themselves" }, { status: 403 });
    }
  }

  if (patch.assigned_to) {
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

  if (
    patch.assigned_to !== undefined &&
    !requestedStatus &&
    existing.status === "open" &&
    !existing.assigned_to &&
    nextState.assigned_to
  ) {
    patch.status = "open";
  }

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
    .eq("id", existing.id)
    .eq("organization_id", profile.organization_id)
    .select("*, response_due_at, resolution_due_at, first_agent_response_at, sla_response_breached, sla_resolution_breached")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTicketLifecycleEvents({
    ticketId: existing.id,
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
      ticketId: existing.id,
      type: "ticket.assigned",
      title: "Ticket assigned",
      message: `${formatTicketNumber(data.ticket_number)} was assigned to you.`,
    });
  }

  if (existing.status !== data.status && data.status === "resolved") {
    await createTicketNotification(supabase, {
      userId: data.created_by,
      ticketId: existing.id,
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

function parseTicketIdentifier(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^TK-(\d+)$/i);
  const numeric = match?.[1] ?? (/^\d+$/.test(trimmed) ? trimmed : null);
  if (!numeric) return null;
  const parsed = Number.parseInt(numeric, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
