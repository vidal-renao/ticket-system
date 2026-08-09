import type { createServiceClientStatic } from "@/lib/supabase/server";
import { canonicalRoutingLabel } from "@/lib/ticket-routing";
import { legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { notifyTicketAssigned } from "@/lib/notifications";

type ServiceClient = ReturnType<typeof createServiceClientStatic>;

export interface AdoptedTicketSummary {
  id: string;
  ticket_number: number | null;
}

/**
 * When an admin onboards a new agent with a specialty/team, any ticket that
 * was left unassigned only because no matching specialist existed yet is
 * handed to them immediately — the backlog for that specialty (if any) is
 * inherited instead of sitting untouched until the next matching ticket
 * arrives. Tickets an admin has manually taken control of
 * (`routing_override`) are never touched by this.
 */
export async function adoptUnassignedTicketsForNewAgent(
  svc: ServiceClient,
  input: { organizationId: string; agentId: string; actorId: string; specialty: string }
): Promise<AdoptedTicketSummary[]> {
  const target = canonicalRoutingLabel(input.specialty);
  if (!target) return [];

  const { data: candidates } = await svc
    .from("tickets")
    .select("id, ticket_number, category_id")
    .eq("organization_id", input.organizationId)
    .eq("status", "open")
    .eq("routing_override", false)
    .is("assigned_to", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  const openCandidates = (candidates ?? []) as { id: string; ticket_number: number | null; category_id: string | null }[];
  if (!openCandidates.length) return [];

  const categoryIds = [...new Set(openCandidates.map((t) => t.category_id).filter((v): v is string => Boolean(v)))];
  const ticketIds = openCandidates.map((t) => t.id);

  const [{ data: categories }, { data: aiRows }] = await Promise.all([
    categoryIds.length
      ? svc.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    svc
      .from("ai_analysis")
      .select("ticket_id, suggested_category")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false }),
  ]);

  const categoryNameById = Object.fromEntries(
    ((categories ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  const aiCategoryByTicket: Record<string, string | null> = {};
  for (const row of (aiRows ?? []) as { ticket_id: string; suggested_category: string | null }[]) {
    if (!(row.ticket_id in aiCategoryByTicket)) aiCategoryByTicket[row.ticket_id] = row.suggested_category;
  }

  const matched = openCandidates.filter((ticket) => {
    const label = ticket.category_id ? categoryNameById[ticket.category_id] : aiCategoryByTicket[ticket.id];
    return Boolean(label) && canonicalRoutingLabel(label) === target;
  });
  if (!matched.length) return [];

  const now = new Date().toISOString();
  const adopted: AdoptedTicketSummary[] = [];

  for (const ticket of matched) {
    // Guarded update: skip if another request assigned this ticket in the
    // meantime instead of racing it.
    const { data: updated } = await svc
      .from("tickets")
      .update({ assigned_to: input.agentId, assigned_at: now })
      .eq("id", ticket.id)
      .eq("organization_id", input.organizationId)
      .eq("status", "open")
      .is("assigned_to", null)
      .select("id, ticket_number, status, assigned_to")
      .maybeSingle();

    if (!updated?.assigned_to) continue;
    adopted.push({ id: updated.id, ticket_number: updated.ticket_number });

    await logTicketLifecycleEvents({
      ticketId: updated.id,
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: "admin",
      oldStatus: "new",
      newStatus: legacyToCanonicalStatus(updated.status, updated.assigned_to),
      oldAssignee: null,
      newAssignee: input.agentId,
    });

    await notifyTicketAssigned(svc, {
      ticketId: updated.id,
      ticketNumber: updated.ticket_number,
      previousAssignee: null,
      nextAssignee: input.agentId,
      source: "backlog",
    });
  }

  return adopted;
}
