import type { TicketPriority, TicketStatus } from "@/lib/supabase/types";
import type { CanonicalTicketStatus } from "@/lib/ticket-lifecycle";

/**
 * Shared contracts for the live operations console (/ops).
 *
 * Column lists are written against the *deployed* schema (verified against the
 * live database), not against docs/schema.sql: `tickets.tags` for example is
 * declared in types.ts but does not exist in this project, so selecting it
 * would fail the whole query.
 */
export const OPS_TICKET_COLUMNS =
  "id, ticket_number, title, status, priority, category, source, detected_language, " +
  "organization_id, created_by, assigned_to, created_at, first_response_at, resolved_at, " +
  "closed_at, response_due_at, resolution_due_at, sla_breached, sla_response_breached, " +
  "sla_resolution_breached, review_status, deleted_at";

export interface OpsTicket {
  id: string;
  ticket_number: number;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  source: string | null;
  detected_language: string | null;
  organization_id: string;
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  response_due_at: string | null;
  resolution_due_at: string | null;
  sla_breached: boolean;
  sla_response_breached: boolean;
  sla_resolution_breached: boolean;
  review_status: string | null;
  deleted_at: string | null;
}

export const OPS_COMMENT_COLUMNS =
  "id, ticket_id, author_id, content, is_internal, is_ai_generated, created_at";

export interface OpsComment {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  is_ai_generated: boolean;
  created_at: string;
}

export const OPS_AUDIT_LOG_COLUMNS =
  "id, actor_id, actor_role, action, resource_type, resource_id, created_at";

export interface OpsAuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

/** `confidence_score` is an integer percentage (0-100) in this database. */
export const OPS_AI_ANALYSIS_COLUMNS =
  "id, ticket_id, sentiment, confidence_score, suggested_priority, summary, detected_language, created_at";

export interface OpsAiAnalysis {
  id: string;
  ticket_id: string | null;
  sentiment: string | null;
  confidence_score: number | null;
  suggested_priority: string | null;
  summary: string | null;
  detected_language: string | null;
  created_at: string | null;
}

export type OpsEventKind =
  | "created"
  | "first_response"
  | "status"
  | "resolved"
  | "closed"
  | "sla_breach"
  | "comment"
  | "audit"
  | "removed";

export interface OpsEvent {
  /** Stable identity, used to de-duplicate replayed or re-fetched events. */
  id: string;
  kind: OpsEventKind;
  at: string;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketTitle: string | null;
  priority: TicketPriority | null;
  actorId: string | null;
  /** Comment excerpt, audit action or resulting status — already truncated. */
  detail: string | null;
  isInternal?: boolean;
  isAiGenerated?: boolean;
  canonicalStatus?: CanonicalTicketStatus;
}

export interface OpsAuditDelivery {
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  status: string | null;
  providerConfirmedAt: string | null;
  providerMessageId: string | null;
  recipient: string | null;
  compliance: number | null;
}

export interface OpsAuditSummary {
  /** Most recent delivery, or null when the report has never run. */
  last: OpsAuditDelivery | null;
  /** Oldest → newest, for the 30-day compliance sparkline. */
  history: { at: string; compliance: number | null }[];
  cron: string;
}

export interface OpsAuthor {
  id: string;
  full_name: string | null;
  role: string | null;
  /**
   * Declared availability and last heartbeat, carried raw so the console can
   * re-derive presence as its clock advances instead of freezing whatever was
   * true when the page was rendered. Absent for customers: presence here means
   * "can pick up a ticket", which only applies to staff.
   */
  availability_status?: string | null;
  last_seen_at?: string | null;
}

export interface OpsInitialData {
  tickets: OpsTicket[];
  events: OpsEvent[];
  authors: OpsAuthor[];
  aiAnalysis: OpsAiAnalysis[];
  organizationName: string;
  organizationId: string;
  viewerRole: string;
  /**
   * Server clock at render time. The console's own `now` is 0 until it mounts,
   * so presence is derived against this on the first paint and server and
   * client agree; afterwards the ticking clock takes over.
   */
  renderedAt: string;
}
