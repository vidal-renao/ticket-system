import { createServiceClientStatic } from "@/lib/supabase/server";

export async function logTicketLifecycleEvents({
  ticketId,
  organizationId,
  actorId,
  actorRole,
  oldStatus,
  newStatus,
  oldAssignee,
  newAssignee,
}: {
  ticketId: string;
  organizationId: string;
  actorId: string;
  actorRole: string;
  oldStatus: string;
  newStatus: string;
  oldAssignee: string | null;
  newAssignee: string | null;
}) {
  const events: Record<string, unknown>[] = [];

  if (oldStatus !== newStatus) {
    events.push({
      organization_id: organizationId,
      actor_id: actorId,
      actor_role: actorRole,
      action: "ticket.status_changed",
      resource_type: "ticket",
      resource_id: ticketId,
      old_values: { status: oldStatus },
      new_values: { status: newStatus },
    });
  }

  if (oldAssignee !== newAssignee) {
    events.push({
      organization_id: organizationId,
      actor_id: actorId,
      actor_role: actorRole,
      action: "ticket.assignment_changed",
      resource_type: "ticket",
      resource_id: ticketId,
      old_values: { assigned_to: oldAssignee },
      new_values: { assigned_to: newAssignee },
    });
  }

  if (events.length === 0) return;

  const svc = createServiceClientStatic();
  const { error } = await svc.from("hd_ticket_audit_logs").insert(events);
  if (error) {
    console.error("[ticket lifecycle audit]", error);
  }
}
