import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { triageTicket } from "@/lib/ai/triage";
import { scrubPII } from "@/lib/ai/pii-scrubber";

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

  // Fire AI triage — uses service client, fully decoupled from request lifecycle
  runAITriage(ticket.id, title.trim(), description.trim(), profile.organization_id)
    .catch((err) => console.error("[AI Triage] Unhandled failure for ticket", ticket.id, err));

  return NextResponse.json({ ticket }, { status: 201 });
}

const AI_TRIAGE_TIMEOUT_MS = 30_000;

async function runAITriage(
  ticketId: string,
  title: string,
  description: string,
  orgId: string,
) {
  // Service client: independent of request cookies — safe for post-response async ops
  const svc = await createServiceClient();

  // Check org-level PII scrubbing setting
  const { data: org } = await svc
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();

  const piiEnabled =
    org?.settings &&
    typeof org.settings === "object" &&
    !Array.isArray(org.settings) &&
    (org.settings as Record<string, unknown>).pii_scrubbing_enabled === true;

  const triageTitle = piiEnabled ? scrubPII(title) : title;
  const triageDescription = piiEnabled ? scrubPII(description) : description;

  let result;
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), AI_TRIAGE_TIMEOUT_MS);
    try {
      result = await triageTicket(triageTitle, triageDescription);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Anthropic failed — persist a failed analysis row so the UI can reflect "pending"
    await svc.from("ai_analysis").insert({
      ticket_id: ticketId,
      suggested_category: "Other",
      suggested_priority: "medium",
      confidence_score: 0,
      sentiment: "neutral",
      detected_language: "en",
      summary: "AI triage unavailable — manual review required.",
      keywords: [],
      smart_response: "",
      estimated_resolution_hours: 24,
      reasoning: `Triage failed: ${err instanceof Error ? err.message : String(err)}`,
      contains_pii_detected: false,
      model_used: "n/a",
      input_tokens: 0,
      output_tokens: 0,
      processing_time_ms: 0,
    });
    console.error("[AI Triage] Anthropic error for ticket", ticketId, err);
    return;
  }

  const { data: category } = await svc
    .from("categories")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", result.suggested_category)
    .single();

  await svc.from("ai_analysis").insert({
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

  const patch: Record<string, unknown> = {
    detected_language: result.detected_language,
    contains_pii: result.contains_pii,
  };

  if (result.confidence_score >= 60) {
    patch.priority = result.suggested_priority;
    if (category?.id) patch.category_id = category.id;
  }

  await svc.from("tickets").update(patch).eq("id", ticketId);
}
