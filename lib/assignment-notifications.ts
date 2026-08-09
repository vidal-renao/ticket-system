/**
 * When an assignment is worth telling somebody about.
 *
 * Four different code paths assign a ticket -- creation-time routing, the
 * post-triage pass, an admin's manual PATCH, and backlog inheritance when an
 * agent is onboarded -- and each carried its own copy of the message and its
 * own idea of when to fire. Only the PATCH path actually guarded against
 * re-notifying an agent who already owned the ticket.
 *
 * No Supabase import here on purpose: the rule stays testable on its own.
 */

/**
 * Notify only a real, *new* owner.
 *
 * Unassigning (next = null) tells nobody, and re-saving a ticket without
 * touching its owner must not produce a second "assigned to you" — which is
 * what an admin editing priority on an already-assigned ticket does.
 */
export function shouldNotifyAssignee(
  previousAssignee: string | null | undefined,
  nextAssignee: string | null | undefined
): boolean {
  if (!nextAssignee) return false;
  return nextAssignee !== previousAssignee;
}

export function formatTicketRef(ticketNumber: number | null | undefined): string {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}

/**
 * `backlog` marks the tickets an agent inherits on their first day, which is a
 * batch of pre-existing work rather than a single new arrival.
 */
export function assignmentNotificationMessage(
  ticketNumber: number | null | undefined,
  source: "routing" | "backlog" = "routing"
): string {
  const ref = formatTicketRef(ticketNumber);
  return source === "backlog"
    ? `${ref} was assigned to you from the unrouted backlog.`
    : `${ref} was assigned to you.`;
}
