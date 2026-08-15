"use server";

import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { resolveTicketAccess } from "@/lib/ticket-visibility";
import type { Database } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

/** Set ticket urgency for a customer-visible organization ticket. */
export async function setTicketUrgency(
  ticketId: string,
  urgent: boolean
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile?.organization_id) return { error: "Forbidden" };
  if (profile.role !== "customer") return { error: "Forbidden" };

  const access = await resolveTicketAccess<
    Pick<Database["public"]["Tables"]["hd_tickets"]["Row"], "id" | "organization_id" | "created_by" | "assigned_to" | "priority">
  >(svc, profile, ticketId, "id, organization_id, created_by, assigned_to, priority");
  if (access.kind !== "allowed") return { error: "Ticket not found" };
  const ticket = access.ticket;

  const newPriority = urgent ? "high" : "medium";
  // Only downgrade if currently medium or lower to avoid overriding agent-set critical
  const safePriority =
    !urgent && (ticket.priority === "critical" || ticket.priority === "high")
      ? ticket.priority  // keep agent-set high/critical when customer says "not urgent"
      : newPriority;

  const { error } = await svc
    .from("hd_tickets")
    .update({ priority: safePriority })
    .eq("id", ticketId)
    .eq("organization_id", profile.organization_id)
    .eq("created_by", user.id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  revalidatePath("/tickets");
  return { ok: true };
}

/** Set customer rating on a customer-visible organization ticket. */
export async function setTicketRating(
  ticketId: string,
  rating: number
): Promise<{ ok: true } | { error: string }> {
  if (rating < 1 || rating > 5) return { error: "Rating must be 1–5" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(supabase, user.id);
  if (!profile?.organization_id) return { error: "Forbidden" };
  if (profile.role !== "customer") return { error: "Forbidden" };

  const access = await resolveTicketAccess<
    Pick<Database["public"]["Tables"]["hd_tickets"]["Row"], "id" | "organization_id" | "created_by" | "assigned_to" | "metadata">
  >(svc, profile, ticketId, "id, organization_id, created_by, assigned_to, metadata");
  if (access.kind !== "allowed") return { error: "Ticket not found" };
  const ticket = access.ticket;

  const existingMeta =
    ticket.metadata && typeof ticket.metadata === "object" && !Array.isArray(ticket.metadata)
      ? (ticket.metadata as Record<string, unknown>)
      : {};

  const { error } = await svc
    .from("hd_tickets")
    .update({ metadata: { ...existingMeta, customer_rating: rating } })
    .eq("id", ticketId)
    .eq("organization_id", profile.organization_id)
    .eq("created_by", user.id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  revalidatePath("/tickets");
  return { ok: true };
}
