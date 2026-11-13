import type { UserRole } from "@/lib/supabase/types";

export type TicketReviewStatus =
  | "not_requested"
  | "pending"
  | "approved"
  | "changes_requested";

const ADMIN_PATCH_FIELDS = new Set(["status", "priority", "category_id", "assigned_to", "tags"]);
const AGENT_PATCH_FIELDS = new Set(["status", "tags"]);

export function getForbiddenTicketPatchFields(role: UserRole, body: Record<string, unknown>): string[] {
  const allowed = role === "admin" ? ADMIN_PATCH_FIELDS : role === "agent" ? AGENT_PATCH_FIELDS : new Set<string>();
  return Object.keys(body).filter((key) => body[key] !== undefined && !allowed.has(key));
}

export function canAgentSetExecutionStatus(current: string, requested: string): boolean {
  if (current === "open") return requested === "in_progress";
  if (current === "in_progress") {
    return requested === "pending_customer" || requested === "pending_third_party";
  }
  if (current === "pending_customer" || current === "pending_third_party") {
    return requested === "in_progress";
  }
  return false;
}

export function canRequestTicketReview(input: {
  role: UserRole;
  actorId: string;
  assignedTo: string | null;
  status: string;
  reviewStatus: TicketReviewStatus;
}): boolean {
  return (
    input.role === "agent" &&
    input.assignedTo === input.actorId &&
    input.status === "in_progress" &&
    input.reviewStatus !== "pending"
  );
}

export function canDecideTicketReview(role: UserRole, reviewStatus: TicketReviewStatus): boolean {
  return role === "admin" && reviewStatus === "pending";
}

export function getTicketBusinessStage(ticket: {
  status: string;
  assigned_to: string | null;
  review_status?: TicketReviewStatus | null;
  deleted_at?: string | null;
}): "trash" | "new" | "assigned" | "in_progress" | "waiting" | "ready" | "processed" {
  if (ticket.deleted_at) return "trash";
  if (ticket.review_status === "pending") return "ready";
  if (ticket.status === "resolved" || ticket.status === "closed") return "processed";
  if (ticket.status === "pending_customer" || ticket.status === "pending_third_party") return "waiting";
  if (ticket.status === "in_progress") return "in_progress";
  if (ticket.assigned_to) return "assigned";
  return "new";
}

/**
 * Whether a new comment may be posted on a ticket in `status`.
 *
 * A closed ticket is finished for the customer: they confirmed it (or it
 * auto-closed) and further help is a new ticket. A `resolved` ticket stays
 * open to the customer, who can still reply or reopen within the window.
 * Staff are not restricted here; their workflow controls own closed tickets.
 */
export function canPostTicketComment(role: UserRole | string | null | undefined, status: string): boolean {
  const isStaff = role === "agent" || role === "manager" || role === "admin";
  if (isStaff) return true;
  return status !== "closed";
}
