/**
 * Who hears about a new comment, and under which event type.
 *
 * Kept free of any Supabase import so the rule itself is testable: the comment
 * route is a long function with SLA, status transitions and email woven
 * through it, and the notification decision was previously a bare condition in
 * the middle of it.
 */

export type CommentNotificationType = "comment.public" | "comment.internal";

export interface CommentNotificationPlan {
  recipientId: string;
  type: CommentNotificationType;
  title: string;
}

/**
 * An internal note goes to whoever owns the ticket; a public comment goes to
 * the other side of the conversation. Returns null when there is nobody to
 * tell -- an unassigned ticket, or an author who would only be notified of
 * their own writing.
 */
export function planCommentNotification(input: {
  /** Effective flag: what was actually stored on the comment row. */
  isInternal: boolean;
  authorId: string;
  authorIsStaff: boolean;
  ticket: { created_by?: string | null; assigned_to?: string | null };
}): CommentNotificationPlan | null {
  const recipientId = input.isInternal
    ? input.ticket.assigned_to
    : input.authorIsStaff
      ? input.ticket.created_by
      : input.ticket.assigned_to;

  if (!recipientId || recipientId === input.authorId) return null;

  return input.isInternal
    ? { recipientId, type: "comment.internal", title: "New internal note" }
    : { recipientId, type: "comment.public", title: "New ticket comment" };
}
