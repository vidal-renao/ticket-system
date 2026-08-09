import { createServiceClientStatic } from "@/lib/supabase/server";
import { assignmentNotificationMessage, shouldNotifyAssignee } from "@/lib/assignment-notifications";

type QueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

interface TicketNotificationInput {
  userId: string | null | undefined;
  ticketId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
}

/**
 * Insert one in-app notification. Returns whether the row was actually
 * written.
 *
 * Deliberately does not throw: a lost notification must not fail the request
 * that triggered it -- nobody should be unable to comment because the bell
 * could not be updated. But it must not vanish quietly either. A silent
 * failure here is indistinguishable from "Realtime is not pushing", which is
 * an expensive thing to debug from the outside, so the log carries enough
 * context to identify the exact notification that was lost.
 */
export async function createTicketNotification(
  _supabase: QueryClient,
  input: TicketNotificationInput
): Promise<boolean> {
  if (!input.userId) return false;

  const svc = createServiceClientStatic();
  const { error } = await svc.from("notifications").insert({
    user_id: input.userId,
    ticket_id: input.ticketId,
    type: input.type,
    title: input.title,
    message: input.message,
    action_url: input.actionUrl ?? `/tickets/${input.ticketId}`,
    is_read: false,
  });

  if (error) {
    console.error("[notification] insert failed", {
      type: input.type,
      ticketId: input.ticketId,
      userId: input.userId,
      error: error.message,
    });
    return false;
  }

  return true;
}

/**
 * The single entry point for "this ticket now belongs to you".
 *
 * Carries its own anti-duplicate guard so every assignment path gets the same
 * behaviour: pass the owner before and after, and the helper decides. Returns
 * whether a notification was actually created.
 */
export async function notifyTicketAssigned(
  client: QueryClient,
  input: {
    ticketId: string;
    ticketNumber: number | null | undefined;
    previousAssignee: string | null | undefined;
    nextAssignee: string | null | undefined;
    source?: "routing" | "backlog";
  }
): Promise<boolean> {
  if (!shouldNotifyAssignee(input.previousAssignee, input.nextAssignee)) return false;

  return createTicketNotification(client, {
    userId: input.nextAssignee,
    ticketId: input.ticketId,
    type: "ticket.assigned",
    title: "Ticket assigned",
    message: assignmentNotificationMessage(input.ticketNumber, input.source),
  });
}

export async function notifyOrgManagers(
  organizationId: string,
  input: Omit<TicketNotificationInput, "userId">
) {
  const svc = createServiceClientStatic();
  const { data: managers } = await svc
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .in("role", ["manager", "admin"])
    .eq("is_active", true);

  await Promise.all(
    (managers ?? []).map((manager: { id: string }) =>
      createTicketNotification(svc, { ...input, userId: manager.id })
    )
  );
}
