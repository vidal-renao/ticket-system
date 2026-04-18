"use server";

import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Set ticket urgency — only the ticket owner (customer) can call this. */
export async function setTicketUrgency(
  ticketId: string,
  urgent: boolean
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();

  // Verify ownership
  const { data: ticket } = await svc
    .from("tickets")
    .select("id, created_by, priority")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.created_by !== user.id) return { error: "Forbidden" };

  const newPriority = urgent ? "high" : "medium";
  // Only downgrade if currently medium or lower to avoid overriding agent-set critical
  const safePriority =
    !urgent && (ticket.priority === "critical" || ticket.priority === "high")
      ? ticket.priority  // keep agent-set high/critical when customer says "not urgent"
      : newPriority;

  const { error } = await svc
    .from("tickets")
    .update({ priority: safePriority })
    .eq("id", ticketId);

  if (error) return { error: error.message };

  revalidatePath("/tickets");
  return { ok: true };
}

/** Set customer rating on a ticket (1–5 stars, stored in metadata.customer_rating). */
export async function setTicketRating(
  ticketId: string,
  rating: number
): Promise<{ ok: true } | { error: string }> {
  if (rating < 1 || rating > 5) return { error: "Rating must be 1–5" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, created_by, metadata")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.created_by !== user.id) return { error: "Forbidden" };

  const existingMeta =
    ticket.metadata && typeof ticket.metadata === "object" && !Array.isArray(ticket.metadata)
      ? (ticket.metadata as Record<string, unknown>)
      : {};

  const { error } = await svc
    .from("tickets")
    .update({ metadata: { ...existingMeta, customer_rating: rating } })
    .eq("id", ticketId);

  if (error) return { error: error.message };

  revalidatePath("/tickets");
  return { ok: true };
}
