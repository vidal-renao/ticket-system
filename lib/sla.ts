import type { TicketStatus } from "@/lib/supabase/types";
import { createServiceClientStatic } from "@/lib/supabase/server";

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
  // Stored verdicts. When the caller supplies them (the cron sweep does),
  // applySlaAssessment can tell a first breach from a known one and skip the
  // write for a ticket whose verdict has not changed.
  sla_response_breached?: boolean | null;
  sla_resolution_breached?: boolean | null;
  sla_breached?: boolean | null;
  sla_first_response_met?: boolean | null;
  sla_resolution_met?: boolean | null;
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

export function buildReopenedSlaPatch(
  ticket: Pick<SlaTicketState, "created_at" | "response_due_at" | "sla_first_response_due"> & {
    sla_response_breached?: boolean;
  },
  policy: SlaPolicy | null,
  reopenedAt = new Date()
) {
  const resolutionDue = policy
    ? addHours(reopenedAt, policy.resolution_hours)
    : null;

  return {
    status: "in_progress" as const,
    resolved_at: null,
    closed_at: null,
    sla_policy_id: policy?.id ?? null,
    resolution_due_at: resolutionDue,
    sla_resolution_due: resolutionDue,
    response_due_at: ticket.response_due_at ?? ticket.sla_first_response_due ?? null,
    sla_response_breached: ticket.sla_response_breached ?? false,
    sla_resolution_breached: false,
    sla_resolution_met: null,
    sla_breached: ticket.sla_response_breached ?? false,
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
        : // The real resolution time decides. A resolved ticket that carries no
          // resolved_at is judged at the evaluation time instead of being
          // assumed on time (DOM-05).
          new Date(resolvedAt ?? now).getTime() > new Date(resolutionDue).getTime())
  );

  return {
    responseBreached,
    resolutionBreached,
    responseMet: responseDue && firstResponseAt ? !responseBreached : null,
    resolutionMet: resolutionDue && isResolved ? !resolutionBreached : null,
    breached: responseBreached || resolutionBreached,
  };
}

const SLA_FLAG_COLUMNS = [
  "sla_response_breached",
  "sla_resolution_breached",
  "sla_breached",
  "sla_first_response_met",
  "sla_resolution_met",
] as const;

/**
 * Evaluates a ticket and stores the verdict.
 *
 * Order matters. The breach is audited and notified *before* the flag is
 * stored: both steps are idempotent, so a run that dies in between is simply
 * repeated by the next one. Stored the other way round, the flag would say
 * "known breach" and the notice would never be sent.
 *
 * A breach whose flag is already stored is a known breach: nothing is audited
 * or notified again, and if no verdict changed nothing is written at all. That
 * is what lets the five-minute sweep pass over thousands of tickets cheaply.
 */
export async function applySlaAssessment(
  supabase: QueryClient,
  ticket: SlaTicketState,
  actorId: string | null,
  actorRole: string | null,
  options: { now?: Date } = {}
) {
  const assessment = assessSla(ticket, options.now ?? new Date());

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

  if (assessment.responseBreached && ticket.sla_response_breached !== true) {
    await logSlaEventOnce(ticket, "ticket.sla_response_breached", actorId, actorRole, assessment);
    await notifySlaBreachOnce(ticket, "sla.response_breached", "SLA response breached");
  }

  if (assessment.resolutionBreached && ticket.sla_resolution_breached !== true) {
    await logSlaEventOnce(ticket, "ticket.sla_resolution_breached", actorId, actorRole, assessment);
    await notifySlaBreachOnce(ticket, "sla.resolution_breached", "SLA resolution breached");
  }

  const stored = ticket as unknown as Record<string, unknown>;
  const unchanged = SLA_FLAG_COLUMNS.every(
    (column) => !(column in patch) || (stored[column] !== undefined && stored[column] === patch[column])
  );

  if (!unchanged) {
    await supabase
      .from("hd_tickets")
      .update(patch)
      .eq("id", ticket.id)
      .eq("organization_id", ticket.organization_id);
  }

  return assessment;
}

/** The columns an SLA evaluation reads from hd_tickets. */
export const SLA_TICKET_COLUMNS =
  "id, ticket_number, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at, sla_response_breached, sla_resolution_breached, sla_breached, sla_first_response_met, sla_resolution_met";

/**
 * Stores the final SLA verdict of a ticket that has just been resolved or
 * closed, measured against its real resolution time (REQ-F1-03).
 *
 * The periodic sweep only looks at active tickets, so without this a ticket
 * resolved after its deadline but before the next sweep kept
 * `sla_resolution_breached = false` for ever and was reported as on time.
 *
 * Never throws: the resolution has already been written, and failing the
 * request now would tell the caller it had not.
 */
export async function recomputeSlaOnResolution(
  supabase: QueryClient,
  ticket: SlaTicketState,
  actorId: string | null,
  actorRole: string | null
): Promise<void> {
  try {
    const withDeadlines = await ensureSlaDeadlines(supabase, ticket);
    await applySlaAssessment(supabase, withDeadlines, actorId, actorRole);
  } catch (error) {
    console.error("[sla] recomputation after resolution failed", {
      ticketId: ticket.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
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
    .from("hd_tickets")
    .update(patch)
    .eq("id", ticket.id)
    .eq("organization_id", ticket.organization_id)
    .select(SLA_TICKET_COLUMNS)
    .single();

  // Same columns as the sweep reads, breach flags included, so the assessment
  // that follows sees the stored verdict instead of undefined.
  return (data as unknown as typeof ticket | null) ?? { ...ticket, ...patch };
}

/**
 * Tells the assignee and every active administrator of the ticket's
 * organization about a breach, once per person and breach type.
 *
 * An unassigned ticket also reaches the managers, as it always has: with no
 * owner, they are the people who can give it one.
 *
 * "Once" is enforced twice. The lookup below skips anyone who already holds
 * this notice; the partial unique index from 202611170001 catches two runs
 * racing each other, and its 23505 is read as "already notified".
 */
async function notifySlaBreachOnce(
  ticket: SlaTicketState,
  type: "sla.response_breached" | "sla.resolution_breached",
  title: string
): Promise<number> {
  const svc = createServiceClientStatic();

  const { data: staff } = await svc
    .from("hd_profiles")
    .select("id")
    .eq("organization_id", ticket.organization_id)
    .in("role", ticket.assigned_to ? ["admin"] : ["admin", "manager"])
    .eq("is_active", true);

  const recipients = [
    ...new Set<string>([
      ...(ticket.assigned_to ? [ticket.assigned_to] : []),
      ...((staff ?? []) as { id: string }[]).map((profile) => profile.id),
    ]),
  ];
  if (recipients.length === 0) return 0;

  const { data: existing } = await svc
    .from("hd_notifications")
    .select("user_id")
    .eq("ticket_id", ticket.id)
    .eq("type", type)
    .in("user_id", recipients);

  const alreadyNotified = new Set(((existing ?? []) as { user_id: string }[]).map((row) => row.user_id));
  const pending = recipients.filter((id) => !alreadyNotified.has(id));

  const results = await Promise.all(
    pending.map(async (userId) => {
      const { error } = await svc.from("hd_notifications").insert({
        user_id: userId,
        ticket_id: ticket.id,
        type,
        title,
        message: `${formatTicketNumber(ticket.ticket_number)} requires attention.`,
        action_url: `/tickets/${ticket.id}`,
        is_read: false,
      });
      if (!error) return true;
      if (error.code !== "23505") {
        console.error("[sla] breach notification failed", {
          type,
          ticketId: ticket.id,
          userId,
          error: error.message,
        });
      }
      return false;
    })
  );

  return results.filter(Boolean).length;
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}

async function logSlaEventOnce(
  ticket: SlaTicketState,
  action: string,
  actorId: string | null,
  actorRole: string | null,
  assessment: ReturnType<typeof assessSla>
) {
  const svc = createServiceClientStatic();
  const { data: existing } = await svc
    .from("hd_ticket_audit_logs")
    .select("id")
    .eq("organization_id", ticket.organization_id)
    .eq("resource_type", "ticket")
    .eq("resource_id", ticket.id)
    .eq("action", action)
    .limit(1);

  if (existing?.length) return;

  await svc.from("hd_ticket_audit_logs").insert({
    organization_id: ticket.organization_id,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: null,
    new_values: assessment,
  });
}
