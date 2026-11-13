"use server";

import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { canPostTicketComment } from "@/lib/ticket-workflow";

export async function saveAiChatNote(
  ticketId: string,
  chatContent: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();

  // Verify the user owns this ticket (customers can only save on their own tickets)
  const { data: ticket } = await svc
    .from("hd_tickets")
    .select("id, status")
    .eq("id", ticketId)
    .eq("created_by", user.id)
    .is("deleted_at", null)
    .single();

  if (!ticket) return { error: "Access denied" };
  // The chat is only offered on open tickets; a closed one takes no new notes.
  if (!canPostTicketComment("customer", ticket.status)) return { error: "Ticket closed" };

  const { error } = await svc.from("hd_ticket_comments").insert({
    ticket_id: ticketId,
    author_id: user.id,
    content: chatContent,
    is_internal: true,
    is_ai_generated: true,
  });

  return error ? { error: error.message } : { ok: true };
}
