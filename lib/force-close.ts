/**
 * Rules for the administrator's emergency close.
 *
 * The normal chain of custody (Intake → Routed → Execution → Admin OK →
 * Resolved → Customer OK) is enforced by `validateTicketTransition` and by the
 * guard in PATCH /api/tickets/[id] that stops an admin resolving a ticket
 * without an approved review. Neither is relaxed: this is a separate door with
 * its own conditions, and the conditions live here so they can be tested
 * without a database.
 */

/** Long enough to be an explanation, short enough to stay readable in a log. */
export const FORCE_CLOSE_REASON_MIN = 10;
export const FORCE_CLOSE_REASON_MAX = 500;

export type ForceCloseRejection =
  | "reason_required"
  | "reason_too_short"
  | "reason_too_long"
  | "already_closed";

/**
 * A reason is mandatory: skipping approval is the kind of act that has to
 * survive the person who did it, and "closed by admin" with no explanation is
 * indistinguishable from a mistake six months later.
 */
export function validateForceCloseReason(
  raw: unknown
): { ok: true; reason: string } | { ok: false; error: ForceCloseRejection } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "reason_required" };
  }

  const reason = raw.trim();
  if (reason.length < FORCE_CLOSE_REASON_MIN) return { ok: false, error: "reason_too_short" };
  if (reason.length > FORCE_CLOSE_REASON_MAX) return { ok: false, error: "reason_too_long" };

  return { ok: true, reason };
}

/**
 * Every state is forceable except the terminal one. Re-closing a closed ticket
 * would write an audit entry describing a change that did not happen.
 */
export function canForceClose(status: string | null | undefined): boolean {
  return status !== "closed";
}

/**
 * A ticket cannot be closed and awaiting review at once -- the cockpit reads
 * that as work still pending on a ticket nobody will touch again. Forcing the
 * close resolves the outstanding review rather than abandoning it.
 */
export function reviewStatusAfterForceClose(current: string | null | undefined): string | null {
  return current === "pending" ? "approved" : null;
}
