import type { TicketPriority } from "@/lib/supabase/types";
import {
  ACTIVE_TICKET_STATUSES,
  WAITING_TICKET_STATUSES,
  legacyToCanonicalStatus,
  type CanonicalTicketStatus,
} from "@/lib/ticket-lifecycle";
import { matchesTicketQuery, ticketRefTokens } from "@/lib/ticket-search";
import type { OpsAuditLog, OpsComment, OpsEvent, OpsTicket } from "@/lib/ops/types";

/** Donut slices and status filters follow the canonical lifecycle enum. */
export const OPS_CANONICAL_STATUSES: CanonicalTicketStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "resolved",
  "closed",
];

export const OPS_PRIORITIES: TicketPriority[] = ["critical", "high", "medium", "low"];

export const MAX_FEED_EVENTS = 80;

export function canonicalOf(ticket: OpsTicket): CanonicalTicketStatus {
  return legacyToCanonicalStatus(ticket.status, ticket.assigned_to);
}

export interface OpsKpis {
  total: number;
  active: number;
  unassigned: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
  slaBreached: number;
  critical: number;
  awaitingReview: number;
  byStatus: Record<CanonicalTicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
}

export function computeOpsKpis(tickets: OpsTicket[]): OpsKpis {
  const byStatus = Object.fromEntries(
    OPS_CANONICAL_STATUSES.map((s) => [s, 0])
  ) as Record<CanonicalTicketStatus, number>;
  const byPriority = Object.fromEntries(
    OPS_PRIORITIES.map((p) => [p, 0])
  ) as Record<TicketPriority, number>;

  let active = 0;
  let waiting = 0;
  let slaBreached = 0;
  let awaitingReview = 0;

  for (const ticket of tickets) {
    byStatus[canonicalOf(ticket)] += 1;
    if (byPriority[ticket.priority] !== undefined) byPriority[ticket.priority] += 1;
    if (ACTIVE_TICKET_STATUSES.includes(ticket.status)) active += 1;
    if (WAITING_TICKET_STATUSES.includes(ticket.status)) waiting += 1;
    if (ticket.sla_breached || ticket.sla_response_breached || ticket.sla_resolution_breached) {
      slaBreached += 1;
    }
    if (ticket.review_status === "pending") awaitingReview += 1;
  }

  return {
    total: tickets.length,
    active,
    unassigned: byStatus.new,
    inProgress: byStatus.in_progress,
    waiting,
    resolved: byStatus.resolved,
    closed: byStatus.closed,
    slaBreached,
    critical: byPriority.critical ?? 0,
    awaitingReview,
    byStatus,
    byPriority,
  };
}

export interface MonthlyFlowPoint {
  key: string;
  created: number;
  resolved: number;
}

/** Created vs. resolved per calendar month, oldest → newest. */
export function computeMonthlyFlow(tickets: OpsTicket[]): MonthlyFlowPoint[] {
  const buckets = new Map<string, MonthlyFlowPoint>();
  const bucket = (iso: string) => {
    const key = iso.slice(0, 7); // YYYY-MM
    let point = buckets.get(key);
    if (!point) {
      point = { key, created: 0, resolved: 0 };
      buckets.set(key, point);
    }
    return point;
  };

  for (const ticket of tickets) {
    bucket(ticket.created_at).created += 1;
    if (ticket.resolved_at) bucket(ticket.resolved_at).resolved += 1;
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function ticketEvent(
  ticket: OpsTicket,
  kind: OpsEvent["kind"],
  at: string,
  extra: Partial<OpsEvent> = {}
): OpsEvent {
  return {
    id: `${kind}:${ticket.id}:${at}`,
    kind,
    at,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    ticketTitle: ticket.title,
    priority: ticket.priority,
    actorId: null,
    detail: null,
    ...extra,
  };
}

/** Lifecycle events reconstructed from the timestamps already on each ticket. */
export function ticketLifecycleEvents(ticket: OpsTicket): OpsEvent[] {
  const events: OpsEvent[] = [ticketEvent(ticket, "created", ticket.created_at)];
  if (ticket.first_response_at) {
    events.push(ticketEvent(ticket, "first_response", ticket.first_response_at));
  }
  if (ticket.resolved_at) {
    events.push(ticketEvent(ticket, "resolved", ticket.resolved_at));
  }
  if (ticket.closed_at) {
    events.push(ticketEvent(ticket, "closed", ticket.closed_at));
  }
  return events;
}

export function commentEvent(
  comment: OpsComment,
  ticket: OpsTicket | undefined
): OpsEvent {
  return {
    id: `comment:${comment.id}`,
    kind: "comment",
    at: comment.created_at,
    ticketId: comment.ticket_id,
    ticketNumber: ticket?.ticket_number ?? null,
    ticketTitle: ticket?.title ?? null,
    priority: ticket?.priority ?? null,
    actorId: comment.author_id,
    detail: excerpt(comment.content),
    isInternal: comment.is_internal,
    isAiGenerated: comment.is_ai_generated,
  };
}

export function auditEvent(log: OpsAuditLog, ticket: OpsTicket | undefined): OpsEvent {
  return {
    id: `audit:${log.id}`,
    kind: "audit",
    at: log.created_at,
    ticketId: log.resource_type === "ticket" ? log.resource_id : null,
    ticketNumber: ticket?.ticket_number ?? null,
    ticketTitle: ticket?.title ?? null,
    priority: ticket?.priority ?? null,
    actorId: log.actor_id,
    detail: log.action,
  };
}

/**
 * Events implied by a realtime UPDATE. A soft delete (`deleted_at` newly set)
 * is reported as a removal so the console can drop the row from every view.
 */
export function ticketUpdateEvents(previous: OpsTicket | undefined, next: OpsTicket): OpsEvent[] {
  if (!previous) return [ticketEvent(next, "created", next.created_at)];

  const events: OpsEvent[] = [];
  const now = new Date().toISOString();

  if (!previous.deleted_at && next.deleted_at) {
    return [ticketEvent(next, "removed", next.deleted_at ?? now)];
  }

  if (!previous.first_response_at && next.first_response_at) {
    events.push(ticketEvent(next, "first_response", next.first_response_at));
  }
  if (!previous.resolved_at && next.resolved_at) {
    events.push(ticketEvent(next, "resolved", next.resolved_at));
  }
  if (!previous.closed_at && next.closed_at) {
    events.push(ticketEvent(next, "closed", next.closed_at));
  }

  const previousCanonical = canonicalOf(previous);
  const nextCanonical = canonicalOf(next);
  const alreadyReported = events.some(
    (event) => event.kind === "resolved" || event.kind === "closed"
  );
  if (previousCanonical !== nextCanonical && !alreadyReported) {
    events.push(
      ticketEvent(next, "status", now, {
        id: `status:${next.id}:${previousCanonical}>${nextCanonical}`,
        canonicalStatus: nextCanonical,
      })
    );
  }

  const wasBreached =
    previous.sla_breached || previous.sla_response_breached || previous.sla_resolution_breached;
  const isBreached =
    next.sla_breached || next.sla_response_breached || next.sla_resolution_breached;
  if (!wasBreached && isBreached) {
    events.push(ticketEvent(next, "sla_breach", now, { id: `sla:${next.id}` }));
  }

  return events;
}

/** Newest first, de-duplicated by event id, capped. */
export function mergeEvents(existing: OpsEvent[], incoming: OpsEvent[]): OpsEvent[] {
  const seen = new Set(existing.map((event) => event.id));
  const merged = [...existing];
  for (const event of incoming) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  merged.sort((a, b) => b.at.localeCompare(a.at));
  return merged.slice(0, MAX_FEED_EVENTS);
}

export function buildSeedEvents(
  tickets: OpsTicket[],
  comments: OpsComment[],
  auditLogs: OpsAuditLog[]
): OpsEvent[] {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const events: OpsEvent[] = [];
  for (const ticket of tickets) events.push(...ticketLifecycleEvents(ticket));
  for (const comment of comments) events.push(commentEvent(comment, byId.get(comment.ticket_id)));
  for (const log of auditLogs) {
    events.push(auditEvent(log, log.resource_id ? byId.get(log.resource_id) : undefined));
  }
  return mergeEvents([], events);
}

export interface OpsFilters {
  status: CanonicalTicketStatus | "all";
  priority: TicketPriority | "all";
  query: string;
}

export function filterOpsTickets(tickets: OpsTicket[], filters: OpsFilters): OpsTicket[] {
  return tickets.filter((ticket) => {
    if (filters.status !== "all" && canonicalOf(ticket) !== filters.status) return false;
    if (filters.priority !== "all" && ticket.priority !== filters.priority) return false;
    // Same matcher as every other ticket list in the app (accent-insensitive,
    // any token order, TK-0042 / 0042 / 42 all match).
    return matchesTicketQuery(filters.query, [
      ticket.title,
      ticket.category,
      ticket.status,
      ticket.priority,
      ...ticketRefTokens(ticket.ticket_number),
    ]);
  });
}
