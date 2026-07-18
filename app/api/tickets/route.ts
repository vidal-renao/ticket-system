import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { triageTicket } from "@/lib/ai/triage";
import { scrubPII } from "@/lib/ai/pii-scrubber";
import { retrieveRelevantKnowledge, buildRAGContext } from "@/lib/ai/rag";
import { getCurrentProfile } from "@/lib/authz";
import { ACTIVE_TICKET_STATUSES, legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { buildSlaDeadlinePatch, getSlaPolicyForTicket } from "@/lib/sla";
import { createTicketNotification } from "@/lib/notifications";
import { sendEmail, ticketEmailSubject } from "@/lib/email";
import { shouldApplyAiPriority } from "@/lib/ai/triage-policy";

export async function POST(request: Request) {
  const supabase = await createClient();
  const svc = createServiceClientStatic();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; description?: string; team_id?: string; priority?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description, team_id, priority: rawPriority } = body;
  const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;
  type Priority = (typeof VALID_PRIORITIES)[number];
  const priority: Priority = VALID_PRIORITIES.includes(rawPriority as Priority)
    ? (rawPriority as Priority)
    : "medium";
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 }
    );
  }

  const profile = await getCurrentProfile(svc, user.id);

  if (!profile?.organization_id) {
    console.error("[POST /api/tickets] Missing organization on profile", {
      userId: user.id,
      role: profile?.role ?? null,
    });
    return NextResponse.json({ error: "User has no organization" }, { status: 400 });
  }

  // Smart auto-assignment based on selected team
  const assignment = await autoAssign(svc, profile.organization_id, team_id ?? null);
  const createdAt = new Date().toISOString();
  const slaPolicy = await getSlaPolicyForTicket(svc, profile.organization_id, priority);
  const slaPatch = buildSlaDeadlinePatch(
    {
      id: "",
      organization_id: profile.organization_id,
      priority,
      status: "open",
      created_at: createdAt,
      resolved_at: null,
    },
    slaPolicy
  );

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      title: title.trim(),
      description: description.trim(),
      organization_id: profile.organization_id,
      created_by: user.id,
      status: "open",
      priority,
      source: "portal",
      created_at: createdAt,
      ...slaPatch,
      ...(assignment.assigned_to && { assigned_to: assignment.assigned_to }),
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/tickets]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (assignment.assigned_to) {
    await logTicketLifecycleEvents({
      ticketId: ticket.id,
      organizationId: profile.organization_id,
      actorId: user.id,
      actorRole: profile.role,
      oldStatus: "new",
      newStatus: legacyToCanonicalStatus(ticket.status, ticket.assigned_to),
      oldAssignee: null,
      newAssignee: assignment.assigned_to,
    });

    await createTicketNotification(supabase, {
      userId: assignment.assigned_to,
      ticketId: ticket.id,
      type: "ticket.assigned",
      title: "Ticket assigned",
      message: `${formatTicketNumber(ticket.ticket_number)} was assigned to you.`,
    });
  }

  const { data: organization } = await svc
    .from("organizations")
    .select("support_email")
    .eq("id", profile.organization_id)
    .single();

  await sendEmail({
    to: organization?.support_email,
    subject: ticketEmailSubject(ticket.ticket_number, ticket.title),
    text: `A new ticket was created.\n\n${formatTicketNumber(ticket.ticket_number)}: ${ticket.title}\nPriority: ${ticket.priority}\n\n${ticket.description}`,
  });

  scheduleBackground(
    runAITriage(ticket.id, title.trim(), description.trim(), profile.organization_id, priority)
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}

// ─── Auto-assignment engine ─────────────────────────────────────────────────

interface AssignmentResult {
  assigned_to: string | null;
}

async function autoAssign(
  svc: ReturnType<typeof createServiceClientStatic>,
  orgId: string,
  teamId: string | null
): Promise<AssignmentResult> {
  let teamExists = false;
  if (teamId) {
    const { data: team } = await svc
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .eq("organization_id", orgId)
      .single();

    teamExists = Boolean(team);
  }

  // Find agents assigned to this team
  const { data: teamAgents } = teamExists
    ? await svc
        .from("profiles")
        .select("id")
        .eq("organization_id", orgId)
        .eq("team_id", teamId)
        .eq("role", "agent")
        .eq("is_active", true)
    : { data: [] };

  const teamAgentIds = (teamAgents ?? []).map((a: { id: string }) => a.id);

  // Try specialist first (overflow threshold: 5 open tickets)
  const specialist = await findLeastBusyAgent(svc, teamAgentIds, 5);

  if (specialist) {
    return { assigned_to: specialist };
  }

  // Overflow — all specialists are saturated; find freest agent org-wide
  const { data: allAgents } = await svc
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "agent")
    .eq("is_active", true);

  const allAgentIds = (allAgents ?? []).map((a: { id: string }) => a.id);
  const overflowAgent = await findLeastBusyAgent(svc, allAgentIds, Infinity);

  return { assigned_to: overflowAgent };
}

/** Returns the agent ID with the fewest open tickets, below maxTickets cap. */
async function findLeastBusyAgent(
  svc: ReturnType<typeof createServiceClientStatic>,
  agentIds: string[],
  maxTickets: number
): Promise<string | null> {
  if (agentIds.length === 0) return null;

  const { data: openTickets } = await svc
    .from("tickets")
    .select("assigned_to")
    .in("assigned_to", agentIds)
    .in("status", ACTIVE_TICKET_STATUSES);

  // Build count map with 0 as default for every agent
  const counts: Record<string, number> = {};
  for (const id of agentIds) counts[id] = 0;
  for (const t of openTickets ?? []) {
    if (t.assigned_to) counts[t.assigned_to] = (counts[t.assigned_to] ?? 0) + 1;
  }

  let bestAgent: string | null = null;
  let minCount = Infinity;

  for (const [agentId, count] of Object.entries(counts)) {
    if (count <= maxTickets && count < minCount) {
      minCount = count;
      bestAgent = agentId;
    }
  }

  return bestAgent;
}

// ─── Background helpers ─────────────────────────────────────────────────────

function scheduleBackground(promise: Promise<void>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require("@vercel/functions") as {
      waitUntil: (p: Promise<unknown>) => void;
    };
    waitUntil(promise);
  } catch {
    promise.catch((err) => console.error("[Background task error]", err));
  }
}

const AI_TRIAGE_TIMEOUT_MS = 30_000;
const MAX_INPUT_CHARS = 3_000;

async function runAITriage(
  ticketId: string,
  title: string,
  description: string,
  orgId: string,
  initialPriority: string
): Promise<void> {
  const svc = createServiceClientStatic();

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

  const safeTitle       = title.slice(0, MAX_INPUT_CHARS);
  const safeDescription = description.slice(0, MAX_INPUT_CHARS);

  const triageTitle       = piiEnabled ? scrubPII(safeTitle)       : safeTitle;
  const triageDescription = piiEnabled ? scrubPII(safeDescription) : safeDescription;

  const ragChunks  = await retrieveRelevantKnowledge(svc, orgId, triageDescription);
  const ragContext = buildRAGContext(ragChunks);

  let result;
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), AI_TRIAGE_TIMEOUT_MS);
    try {
      result = await triageTicket(triageTitle, triageDescription, ac.signal, ragContext);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
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

  const { data: currentTicket } = await svc
    .from("tickets")
    .select("id, organization_id, priority, status, created_at, resolved_at, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due")
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .single();

  if (result.confidence_score >= 60) {
    if (category?.id) patch.category_id = category.id;
  }

  if (currentTicket && shouldApplyAiPriority({
    confidence: result.confidence_score,
    initialPriority,
    currentPriority: currentTicket.priority,
    suggestedPriority: result.suggested_priority,
  })) {
    const policy = await getSlaPolicyForTicket(svc, orgId, result.suggested_priority);
    patch.priority = result.suggested_priority;
    Object.assign(
      patch,
      buildSlaDeadlinePatch(
        { ...currentTicket, priority: result.suggested_priority },
        policy,
        { preserveExisting: false }
      )
    );
  }

  await svc
    .from("tickets")
    .update(patch)
    .eq("id", ticketId)
    .eq("organization_id", orgId);
}
