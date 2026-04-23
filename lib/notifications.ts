import { createServiceClientStatic } from "@/lib/supabase/server";

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
