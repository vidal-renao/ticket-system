import type { TicketStatus } from "@/lib/supabase/types";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { createTicketNotification, notifyOrgManagers } from "@/lib/notifications";

type QueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

interface SlaPolicy {
  id: string;
  first_response_hours: number;
  resolution_hours: number;
}

export interface SlaTicketState {
  id: string;
  organization_id: string;
  priority: string;
  status: TicketStatus | string;
  created_at: string;
  resolved_at: string | null;
  first_response_at?: string | null;
  first_agent_response_at?: string | null;
  assigned_to?: string | null;
  ticket_number?: number | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  response_due_at?: string | null;
  resolution_due_at?: string | null;
}

export function addHours(date: string | Date, hours: number): string {
  const base = typeof date === "string" ? new Date(date) : date;
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export async function getSlaPolicyForTicket(
  supabase: QueryClient,
  organizationId: string,
  priority: string
): Promise<SlaPolicy | null> {
  const { data } = await supabase
    .from("sla_policies")
    .select("id, first_response_hours, resolution_hours")
    .eq("organization_id", organizationId)
    .eq("priority", priority)
    .eq("is_active", true)
    .single();

  return data ?? null;
}

export function buildSlaDeadlinePatch(
  ticket: SlaTicketState,
  policy: SlaPolicy | null,
  options: { preserveExisting?: boolean } = {}
) {
  if (!policy) return {};

  const preserveExisting = options.preserveExisting ?? true;
  const responseDue = preserveExisting
    ? ticket.response_due_at ?? ticket.sla_first_response_due ?? addHours(ticket.created_at, policy.first_response_hours)
    : addHours(ticket.created_at, policy.first_response_hours);
  const resolutionDue = preserveExisting
    ? ticket.resolution_due_at ?? ticket.sla_resolution_due ?? addHours(ticket.created_at, policy.resolution_hours)
    : addHours(ticket.created_at, policy.resolution_hours);

  return {
    sla_policy_id: policy.id,
    response_due_at: responseDue,
    resolution_due_at: resolutionDue,
    sla_first_response_due: responseDue,
    sla_resolution_due: resolutionDue,
  };
}

export function assessSla(ticket: SlaTicketState, now = new Date()) {
  const firstResponseAt = ticket.first_agent_response_at ?? ticket.first_response_at ?? null;
  const responseDue = ticket.response_due_at ?? ticket.sla_first_response_due ?? null;
  const resolutionDue = ticket.resolution_due_at ?? ticket.sla_resolution_due ?? null;
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";
  const resolvedAt = ticket.resolved_at ?? null;

  const responseBreached = Boolean(
    responseDue &&
      (!firstResponseAt
        ? now.getTime() > new Date(responseDue).getTime()
        : new Date(firstResponseAt).getTime() > new Date(responseDue).getTime())
  );

  const resolutionBreached = Boolean(
    resolutionDue &&
      (!isResolved
        ? now.getTime() > new Date(resolutionDue).getTime()
        : resolvedAt
          ? new Date(resolvedAt).getTime() > new Date(resolutionDue).getTime()
          : false)
  );

  return {
    responseBreached,
    resolutionBreached,
    responseMet: responseDue && firstResponseAt ? !responseBreached : null,
    resolutionMet: resolutionDue && isResolved ? !resolutionBreached : null,
    breached: responseBreached || resolutionBreached,
  };
}

export async function applySlaAssessment(
  supabase: QueryClient,
  ticket: SlaTicketState,
  actorId: string | null,
  actorRole: string | null
) {
  const assessment = assessSla(ticket);

  const patch: Record<string, unknown> = {
    sla_response_breached: assessment.responseBreached,
    sla_resolution_breached: assessment.resolutionBreached,
    sla_breached: assessment.breached,
  };

  if (assessment.responseMet !== null) {
    patch.sla_first_response_met = assessment.responseMet;
  }

  if (assessment.resolutionMet !== null) {
    patch.sla_resolution_met = assessment.resolutionMet;
  }

  await supabase.from("tickets").update(patch).eq("id", ticket.id);

  if (assessment.responseBreached) {
    await logSlaEventOnce(ticket, "ticket.sla_response_breached", actorId, actorRole);
    await notifySlaBreachOnce(ticket, "sla.response_breached", "SLA response breached");
  }

  if (assessment.resolutionBreached) {
    await logSlaEventOnce(ticket, "ticket.sla_resolution_breached", actorId, actorRole);
    await notifySlaBreachOnce(ticket, "sla.resolution_breached", "SLA resolution breached");
  }

  return assessment;
}

export async function ensureSlaDeadlines(
  supabase: QueryClient,
  ticket: SlaTicketState
): Promise<SlaTicketState> {
  if (
    (ticket.response_due_at || ticket.sla_first_response_due) &&
    (ticket.resolution_due_at || ticket.sla_resolution_due)
  ) {
    return ticket;
  }

  const policy = await getSlaPolicyForTicket(supabase, ticket.organization_id, ticket.priority);
  const patch = buildSlaDeadlinePatch(ticket, policy);
  if (Object.keys(patch).length === 0) return ticket;

  const { data } = await supabase
    .from("tickets")
    .update(patch)
    .eq("id", ticket.id)
    .select("id, ticket_number, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
    .single();

  return data ?? { ...ticket, ...patch };
}

async function notifySlaBreachOnce(
  ticket: SlaTicketState,
  type: string,
  title: string
) {
  const svc = createServiceClientStatic();
  const recipientId = ticket.assigned_to;

  if (recipientId) {
    const { data: existing } = await svc
      .from("notifications")
      .select("id")
      .eq("user_id", recipientId)
      .eq("ticket_id", ticket.id)
      .eq("type", type)
      .limit(1);

    if (!existing?.length) {
      await createTicketNotification(svc, {
        userId: recipientId,
        ticketId: ticket.id,
        type,
        title,
        message: `${formatTicketNumber(ticket.ticket_number)} requires attention.`,
      });
    }
    return;
  }

  const { data: existingManagerNotice } = await svc
    .from("notifications")
    .select("id")
    .eq("ticket_id", ticket.id)
    .eq("type", type)
    .limit(1);

  if (existingManagerNotice?.length) return;

  await notifyOrgManagers(ticket.organization_id, {
    ticketId: ticket.id,
    type,
    title,
    message: `${formatTicketNumber(ticket.ticket_number)} requires attention.`,
  });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}

async function logSlaEventOnce(
  ticket: SlaTicketState,
  action: string,
  actorId: string | null,
  actorRole: string | null
) {
  const svc = createServiceClientStatic();
  const { data: existing } = await svc
    .from("audit_logs")
    .select("id")
    .eq("resource_type", "ticket")
    .eq("resource_id", ticket.id)
    .eq("action", action)
    .limit(1);

  if (existing?.length) return;

  await svc.from("audit_logs").insert({
    organization_id: ticket.organization_id,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: null,
    new_values: assessSla(ticket),
  });
}
