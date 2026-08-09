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

export async function createTicketNotification(
  _supabase: QueryClient,
  input: TicketNotificationInput
) {
  if (!input.userId) return;

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
    console.error("[notification]", error);
  }
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

  await createTicketNotification(client, {
    userId: input.nextAssignee,
    ticketId: input.ticketId,
    type: "ticket.assigned",
    title: "Ticket assigned",
    message: assignmentNotificationMessage(input.ticketNumber, input.source),
  });
  return true;
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
