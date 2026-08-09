import { createServiceClientStatic } from "@/lib/supabase/server";
import { triageTicket } from "@/lib/ai/triage";
import { scrubPII } from "@/lib/ai/pii-scrubber";
import { retrieveRelevantKnowledge, buildRAGContext } from "@/lib/ai/rag";
import { ACTIVE_TICKET_STATUSES, legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { buildSlaDeadlinePatch, getSlaPolicyForTicket } from "@/lib/sla";
import { createTicketNotification } from "@/lib/notifications";
import { shouldApplyAiPriority } from "@/lib/ai/triage-policy";
import { selectFreestAgent, selectSpecialistAgent, type RoutingCandidate } from "@/lib/ticket-routing";

/**
 * AI triage and automatic assignment, extracted from the ticket-creation route
 * so the exact same pipeline can be re-run on an existing ticket. TK-0073 had
 * no ai_analysis row at all -- not even the failure-path row -- so the
 * background task never completed, and there was no way to re-run it.
 */

function formatTicketNumber(ticketNumber: number | null | undefined) {
  return ticketNumber ? `TK-${String(ticketNumber).padStart(4, "0")}` : "Ticket";
}
// ─── Auto-assignment engine ─────────────────────────────────────────────────

export interface AssignmentResult {
  assignedTo: string | null;
  categoryId: string | null;
}

export async function findAutomaticAssignment(
  svc: ReturnType<typeof createServiceClientStatic>,
  orgId: string,
  input: { teamId: string | null; categoryName: string | null }
): Promise<AssignmentResult> {
  const [{ data: team }, { data: categories }, { data: agents }, { data: teams }] = await Promise.all([
    input.teamId
      ? svc.from("teams").select("id, name").eq("id", input.teamId).eq("organization_id", orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    svc.from("categories").select("id, name, slug").eq("organization_id", orgId).eq("is_active", true),
    svc.from("profiles").select("id, specialty, team_id").eq("organization_id", orgId).eq("role", "agent").eq("is_active", true),
    svc.from("teams").select("id, name").eq("organization_id", orgId),
  ]);

  const category = (categories ?? []).find((entry) => {
    const target = (input.categoryName ?? "").toLowerCase();
    return entry.slug?.toLowerCase() === target || entry.name?.toLowerCase() === target;
  }) ?? null;

  // Find agents assigned to this team
  const agentIds = (agents ?? []).map((agent) => agent.id);

  // Try specialist first (overflow threshold: 5 open tickets)
  const { data: openTickets } = agentIds.length
    ? await svc.from("tickets").select("assigned_to").eq("organization_id", orgId).in("assigned_to", agentIds).in("status", ACTIVE_TICKET_STATUSES).is("deleted_at", null)
    : { data: [] };
  const counts: Record<string, number> = {};
  for (const row of openTickets ?? []) {
    if (row.assigned_to) counts[row.assigned_to] = (counts[row.assigned_to] ?? 0) + 1;
  }

  const teamNames = Object.fromEntries((teams ?? []).map((entry) => [entry.id, entry.name]));
  const candidates: RoutingCandidate[] = (agents ?? []).map((agent) => ({
    id: agent.id,
    specialty: agent.specialty,
    teamId: agent.team_id,
    teamName: agent.team_id ? teamNames[agent.team_id] ?? null : null,
    activeTickets: counts[agent.id] ?? 0,
  }));
  // Specialist first; overflow to the freest agent org-wide when no specialty
  // or team matches, so nothing lands unassigned for lack of a specialist.
  const selected =
    selectSpecialistAgent(candidates, {
      categoryName: category?.name ?? input.categoryName,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
    }) ?? selectFreestAgent(candidates);

  return { assignedTo: selected?.id ?? null, categoryId: category?.id ?? null };
}

// ─── Background helpers ─────────────────────────────────────────────────────

export function scheduleBackground(promise: Promise<void>): void {
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

export async function runAITriage(
  ticketId: string,
  title: string,
  description: string,
  orgId: string,
  initialPriority: string,
  creatorId?: string
): Promise<void> {
  const svc = createServiceClientStatic();

  const [{ data: org }, { data: orgCategories }, { data: creatorCompany }] = await Promise.all([
    svc.from("organizations").select("settings").eq("id", orgId).single(),
    svc.from("categories").select("name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    creatorId
      ? svc.from("customers_info").select("company_name, industry, business_details").eq("id", creatorId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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

  const orgContext = {
    companyName: creatorCompany?.company_name ?? null,
    companySector: creatorCompany?.industry ?? null,
    companyDetails: piiEnabled ? null : creatorCompany?.business_details ?? null,
    activeCategories: (orgCategories ?? []).map((c: { name: string }) => c.name).filter(Boolean),
  };

  let result;
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), AI_TRIAGE_TIMEOUT_MS);
    try {
      result = await triageTicket(triageTitle, triageDescription, ac.signal, ragContext, orgContext);
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
    .select("id, organization_id, created_by, assigned_to, routing_override, priority, status, created_at, resolved_at, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due")
    .eq("id", ticketId)
    .eq("organization_id", orgId)
    .single();

  if (result.confidence_score >= 60 && currentTicket?.routing_override !== true) {
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

  if (currentTicket && !currentTicket.assigned_to && !currentTicket.routing_override && result.confidence_score >= 60) {
    const assignment = await findAutomaticAssignment(svc, orgId, {
      teamId: null,
      categoryName: result.suggested_category,
    });
    if (assignment.assignedTo) {
      const { data: assignedTicket } = await svc
        .from("tickets")
        .update({
          assigned_to: assignment.assignedTo,
          assigned_at: new Date().toISOString(),
          ...(category?.id ? { category_id: category.id } : {}),
        })
        .eq("id", ticketId)
        .eq("organization_id", orgId)
        .eq("routing_override", false)
        .is("assigned_to", null)
        .is("deleted_at", null)
        .select("id, ticket_number, status, assigned_to")
        .maybeSingle();

      if (assignedTicket?.assigned_to) {
        await logTicketLifecycleEvents({
          ticketId,
          organizationId: orgId,
          actorId: currentTicket.created_by,
          actorRole: "system",
          oldStatus: "new",
          newStatus: legacyToCanonicalStatus(assignedTicket.status, assignedTicket.assigned_to),
          oldAssignee: null,
          newAssignee: assignedTicket.assigned_to,
        });
        await createTicketNotification(svc, {
          userId: assignedTicket.assigned_to,
          ticketId,
          type: "ticket.assigned",
          title: "Ticket assigned",
          message: `${formatTicketNumber(assignedTicket.ticket_number)} was assigned to you.`,
        });
      }
    }
  }
}
