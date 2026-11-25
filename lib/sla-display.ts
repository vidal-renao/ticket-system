/**
 * What the ticket detail "SLA Deadline" card shows.
 *
 * Pure: the page computes it at render time and passes `now`, the tests pass a
 * fixed clock. The breach rules match `assessSla` in lib/sla.ts (which writes
 * the stored flags): a target is met when its completion timestamp is not
 * later than its due date, and breached otherwise or when it is still open
 * after the due date. The difference is that this also says which targets are
 * finished, so a finished target stops counting down.
 */

export type SlaTargetState =
  /** Still open, comfortably within the target. A live countdown is shown. */
  | "running"
  /** Still open, inside the last hour or the last 25% of the window. */
  | "at_risk"
  /** Still open and already past the due date. */
  | "overdue"
  /** Finished on or before the due date. Final. */
  | "met"
  /** Finished after the due date. Final. */
  | "missed";

export type SlaOverallState = "on_time" | "at_risk" | "breached" | "met";

export interface SlaTargetDisplay {
  state: SlaTargetState;
  dueAt: string;
  /** Set for final states: when the response or resolution happened. */
  completedAt: string | null;
}

export interface SlaDisplay {
  response: SlaTargetDisplay | null;
  resolution: SlaTargetDisplay | null;
  overall: SlaOverallState | null;
}

export interface SlaDisplayTicket {
  status: string;
  created_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  first_response_at?: string | null;
  first_agent_response_at?: string | null;
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  sla_response_breached?: boolean | null;
  sla_resolution_breached?: boolean | null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const AT_RISK_FRACTION = 0.25;

export function isFinalSlaState(state: SlaTargetState): boolean {
  return state === "met" || state === "missed";
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function openTarget(dueAt: string, startedAt: string, now: number): SlaTargetDisplay {
  const due = toTime(dueAt);
  const start = toTime(startedAt);
  if (due === null) return { state: "running", dueAt, completedAt: null };

  const remaining = due - now;
  if (remaining < 0) return { state: "overdue", dueAt, completedAt: null };

  const window = start === null ? 0 : due - start;
  const atRisk = remaining <= ONE_HOUR_MS || (window > 0 && remaining / window <= AT_RISK_FRACTION);
  return { state: atRisk ? "at_risk" : "running", dueAt, completedAt: null };
}

function finishedTarget(
  dueAt: string,
  completedAt: string | null,
  storedBreach: boolean
): SlaTargetDisplay {
  const due = toTime(dueAt);
  const done = toTime(completedAt);
  const late = due !== null && done !== null && done > due;
  return { state: late || storedBreach ? "missed" : "met", dueAt, completedAt };
}

export function deriveSlaDisplay(ticket: SlaDisplayTicket, now: number = Date.now()): SlaDisplay {
  const responseDue = ticket.response_due_at ?? ticket.sla_first_response_due ?? null;
  const resolutionDue = ticket.resolution_due_at ?? ticket.sla_resolution_due ?? null;
  const firstResponseAt = ticket.first_agent_response_at ?? ticket.first_response_at ?? null;
  const isFinished = ticket.status === "resolved" || ticket.status === "closed";

  let response: SlaTargetDisplay | null = null;
  if (responseDue) {
    if (firstResponseAt) {
      response = finishedTarget(responseDue, firstResponseAt, false);
    } else if (isFinished) {
      // Resolved without a public staff reply: the response clock stops with
      // the resolution, judged against the same due date.
      response = finishedTarget(
        responseDue,
        ticket.resolved_at ?? ticket.closed_at ?? null,
        Boolean(ticket.sla_response_breached)
      );
    } else {
      response = openTarget(responseDue, ticket.created_at, now);
      if (ticket.sla_response_breached && response.state !== "overdue") {
        response = { ...response, state: "overdue" };
      }
    }
  }

  let resolution: SlaTargetDisplay | null = null;
  if (resolutionDue) {
    resolution = isFinished
      ? finishedTarget(
          resolutionDue,
          ticket.resolved_at ?? ticket.closed_at ?? null,
          Boolean(ticket.sla_resolution_breached)
        )
      : openTarget(resolutionDue, ticket.created_at, now);
  }

  const targets = [response, resolution].filter((target): target is SlaTargetDisplay => target !== null);
  let overall: SlaOverallState | null = null;
  if (targets.length > 0) {
    if (targets.some((target) => target.state === "missed" || target.state === "overdue")) {
      overall = "breached";
    } else if (targets.every((target) => isFinalSlaState(target.state))) {
      overall = "met";
    } else if (targets.some((target) => target.state === "at_risk")) {
      overall = "at_risk";
    } else {
      overall = "on_time";
    }
  }

  return { response, resolution, overall };
}
