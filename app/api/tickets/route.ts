import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triageTicket } from "@/lib/ai/triage";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description } = body;
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "User has no organization" }, { status: 400 });
  }

  // Create ticket with defaults — AI will update priority/category
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      title: title.trim(),
      description: description.trim(),
      organization_id: profile.organization_id,
      created_by: user.id,
      status: "open",
      priority: "medium",
      source: "portal",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/tickets]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire AI triage — async, non-blocking
  runAITriage(ticket.id, title.trim(), description.trim(), profile.organization_id, supabase)
    .catch((err) => console.error("[AI Triage] Failed for ticket", ticket.id, err));

  return NextResponse.json({ ticket }, { status: 201 });
}

async function runAITriage(
  ticketId: string,
  title: string,
  description: string,
  orgId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const startTime = Date.now();
  const result = await triageTicket(title, description);

  // Resolve category_id
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", result.suggested_category)
    .single();

  // Store AI analysis
  await supabase.from("ai_analysis").insert({
    ticket_id: ticketId,
    suggested_category: result.suggested_category,
    suggested_priority: result.suggested_priority,
    confidence_score: result.confidence_score,
    sentiment: result.sentiment,
    detected_language: result.detected_language,
    summary: result.summary,
    keywords: result.keywords,
    smart_response: result.smart_response,
    estimated_resolution_hours: result.estimated_resolution_hours,
    reasoning: result.reasoning,
    contains_pii_detected: result.contains_pii,
    model_used: result.model_used,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    processing_time_ms: result.processing_time_ms,
  });

  // Update ticket with AI suggestions (only if confidence >= 60)
  const patch: Record<string, unknown> = {
    detected_language: result.detected_language,
    contains_pii: result.contains_pii,
  };

  if (result.confidence_score >= 60) {
    patch.priority = result.suggested_priority;
    if (category?.id) patch.category_id = category.id;
  }

  await supabase.from("tickets").update(patch).eq("id", ticketId);
}
