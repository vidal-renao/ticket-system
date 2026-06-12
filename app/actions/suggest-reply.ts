"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { canViewTicket, getCurrentUserContext, isAdmin, isEmployee } from "@/lib/auth/permissions";

const LANG_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  it: "Italian",
  en: "English",
};

export async function suggestReply(
  ticketId: string
): Promise<{ suggestion: string } | { error: string }> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return { error: "Unauthorized" };

  // Service client bypasses RLS — identity already verified via getUser()
  const svc = createServiceClientStatic();

  if (!isAdmin(ctx) && !isEmployee(ctx)) {
    return { error: "Forbidden" };
  }

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, title, description, category_id, organization_id, created_by, assigned_to")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (!canViewTicket(ctx, ticket)) return { error: "Forbidden" };

  // Flat queries — avoid nested join direction issues with PostgREST
  const [{ data: categoryRow }, { data: aiRow }] = await Promise.all([
    ticket.category_id
      ? svc.from("categories").select("name").eq("id", ticket.category_id).single()
      : Promise.resolve({ data: null }),
    svc
      .from("ai_analysis")
      .select("sentiment, detected_language")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const sentiment: string = (aiRow as { sentiment?: string } | null)?.sentiment ?? "neutral";
  const language: string  = (aiRow as { detected_language?: string } | null)?.detected_language ?? "en";
  const category: string  = (categoryRow as { name?: string } | null)?.name ?? "General";
  const langName = LANG_NAMES[language] ?? "English";

  const isUpset = ["frustrated", "angry"].includes(sentiment);
  const toneInstruction = isUpset
    ? "The customer is upset or frustrated. Start by explicitly acknowledging their frustration with empathy. Be especially conciliatory and understanding. Avoid any defensive or dismissive language. Reassure them the issue has full priority."
    : "Maintain a professional, helpful, solution-oriented tone. Swiss business standard: precise, warm, and efficient.";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a professional IT support agent at a Swiss SME. Write a support reply to this ticket.

TICKET TITLE: ${ticket.title}
TICKET DESCRIPTION: ${ticket.description}
CATEGORY: ${category}
CUSTOMER SENTIMENT: ${sentiment}

STRICT INSTRUCTIONS:
- Write ONLY the reply body — no subject line, no salutation, no sign-off
- Language: ${langName} — the ENTIRE reply must be in ${langName}
- Length: 3–5 sentences maximum
- ${toneInstruction}
- State clearly what action will be taken next and give a realistic timeframe
- Do NOT repeat PII (names, emails, IPs) from the ticket description`,
      },
    ],
  });

  if (response.content[0].type !== "text") return { error: "AI returned no text" };

  return { suggestion: response.content[0].text.trim() };
}
