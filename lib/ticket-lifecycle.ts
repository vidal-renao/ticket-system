import type { TicketStatus } from "@/lib/supabase/types";

export type CanonicalTicketStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

export const CANONICAL_STATUS_LABELS: Record<CanonicalTicketStatus, string> = {
  new: "NEW",
  assigned: "ASSIGNED",
  in_progress: "IN_PROGRESS",
  waiting_customer: "WAITING_CUSTOMER",
  resolved: "RESOLVED",
  closed: "CLOSED",
};

export const ALLOWED_CANONICAL_TRANSITIONS: Record<
  CanonicalTicketStatus,
  CanonicalTicketStatus[]
> = {
  new: ["assigned"],
  assigned: ["new", "in_progress"],
  in_progress: ["waiting_customer", "resolved"],
  waiting_customer: ["in_progress"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

const CANONICAL_INPUTS: Record<string, CanonicalTicketStatus> = {
  new: "new",
  assigned: "assigned",
  in_progress: "in_progress",
  waiting_customer: "waiting_customer",
  resolved: "resolved",
  closed: "closed",
  NEW: "new",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  WAITING_CUSTOMER: "waiting_customer",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

const LEGACY_INPUTS = new Set([
  "open",
  "in_progress",
  "pending_customer",
  "pending_third_party",
  "resolved",
  "closed",
]);

export function legacyToCanonicalStatus(
  status: TicketStatus | string,
  assignedTo?: string | null
): CanonicalTicketStatus {
  switch (status) {
    case "open":
      return assignedTo ? "assigned" : "new";
    case "in_progress":
      return "in_progress";
    case "pending_customer":
    case "pending_third_party":
      return "waiting_customer";
    case "resolved":
      return "resolved";
    case "closed":
      return "closed";
    default:
      return CANONICAL_INPUTS[status] ?? "new";
  }
}

export function normalizeStatusInput(value: unknown): CanonicalTicketStatus | null {
  if (typeof value !== "string") return null;
  if (CANONICAL_INPUTS[value]) return CANONICAL_INPUTS[value];
  if (LEGACY_INPUTS.has(value)) return legacyToCanonicalStatus(value);
  return null;
}

export function canonicalToLegacyStatus(status: CanonicalTicketStatus): TicketStatus {
  switch (status) {
    case "new":
    case "assigned":
      return "open";
    case "waiting_customer":
      return "pending_customer";
    case "in_progress":
    case "resolved":
    case "closed":
      return status;
  }
}

export interface TicketLifecycleState {
  status: TicketStatus | string;
  assigned_to: string | null;
}

export interface TransitionCheck {
  ok: boolean;
  from: CanonicalTicketStatus;
  to: CanonicalTicketStatus;
  error?: string;
}

export function validateTicketTransition(
  current: TicketLifecycleState,
  next: TicketLifecycleState
): TransitionCheck {
  const from = legacyToCanonicalStatus(current.status, current.assigned_to);
  const to = legacyToCanonicalStatus(next.status, next.assigned_to);

  if (from === to) return { ok: true, from, to };

  const allowed = ALLOWED_CANONICAL_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      from,
      to,
      error: `Invalid transition: ${CANONICAL_STATUS_LABELS[from]} -> ${CANONICAL_STATUS_LABELS[to]}`,
    };
  }

  return { ok: true, from, to };
}
