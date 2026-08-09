import { createServiceClientStatic } from "@/lib/supabase/server";
import { triageTicket } from "@/lib/ai/triage";
import { scrubPII } from "@/lib/ai/pii-scrubber";
import { retrieveRelevantKnowledge, buildRAGContext } from "@/lib/ai/rag";
import { ACTIVE_TICKET_STATUSES, legacyToCanonicalStatus } from "@/lib/ticket-lifecycle";
import { logTicketLifecycleEvents } from "@/lib/ticket-events";
import { buildSlaDeadlinePatch, getSlaPolicyForTicket } from "@/lib/sla";
import { notifyTicketAssigned } from "@/lib/notifications";
import { shouldApplyAiPriority } from "@/lib/ai/triage-policy";
import { routeTicket, ROUTING_AWAITING_AVAILABILITY, type RoutingCandidate } from "@/lib/ticket-routing";
import { effectivePresence } from "@/lib/presence";
import { getLastSeenMap } from "@/lib/presence-server";

/**
 * AI triage and automatic assignment, extracted from the ticket-creation route
 * so the exact same pipeline can be re-run on an existing ticket. TK-0073 had
 * no ai_analysis row at all -- not even the failure-path row -- so the
 * background task never completed, and there was no way to re-run it.
 */

// ─── Auto-assignment engine ─────────────────────────────────────────────────

export interface AssignmentResult {
  assignedTo: string | null;
  categoryId: string | null;
  /**
   * Set when routing deliberately declined to assign because no agent was
   * reachable. Callers stamp it onto the ticket so the queue can say why the
   * ticket has no owner instead of showing a bare "Unassigned".
   */
  unassignedReason: "no_agents_available" | null;
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
    svc.from("profiles").select("id, specialty, team_id, availability_status").eq("organization_id", orgId).eq("role", "agent").eq("is_active", true),
    svc.from("teams").select("id, name").eq("organization_id", orgId),
  ]);

  const category = (categories ?? []).find((entry) => {
    const target = (input.categoryName ?? "").toLowerCase();
    return entry.slug?.toLowerCase() === target || entry.name?.toLowerCase() === target;
  }) ?? null;

  const agentIds = (agents ?? []).map((agent) => agent.id);

  // Current load, and the heartbeats that say who is actually at the keyboard.
  // last_seen_at goes through getLastSeenMap rather than the select above so a
  // database without the presence migration degrades to the declared status
  // instead of failing the whole routing query.
  const [{ data: openTickets }, lastSeenByAgent] = await Promise.all([
    agentIds.length
      ? svc.from("tickets").select("assigned_to").eq("organization_id", orgId).in("assigned_to", agentIds).in("status", ACTIVE_TICKET_STATUSES).is("deleted_at", null)
      : Promise.resolve({ data: [] as { assigned_to: string | null }[] }),
    getLastSeenMap(svc, agentIds),
  ]);
  const counts: Record<string, number> = {};
  for (const row of openTickets ?? []) {
    if (row.assigned_to) counts[row.assigned_to] = (counts[row.assigned_to] ?? 0) + 1;
  }

  const teamNames = Object.fromEntries((teams ?? []).map((entry) => [entry.id, entry.name]));
  const now = Date.now();
  const candidates: RoutingCandidate[] = (agents ?? []).map((agent) => ({
    id: agent.id,
    specialty: agent.specialty,
    teamId: agent.team_id,
    teamName: agent.team_id ? teamNames[agent.team_id] ?? null : null,
    activeTickets: counts[agent.id] ?? 0,
    // Only "online" counts: effectivePresence keeps "busy" distinct from
    // "offline", and busy means do not send more work.
    available: effectivePresence(agent.availability_status, lastSeenByAgent[agent.id], now) === "online",
  }));

  const decision = routeTicket(candidates, {
    categoryName: category?.name ?? input.categoryName,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
  });

  if (decision.reason === "no_agents_available") {
    console.warn("[routing] no reachable agent in org", orgId, "- leaving ticket unassigned");
  }

  return {
    assignedTo: decision.agent?.id ?? null,
    categoryId: category?.id ?? null,
    unassignedReason: decision.reason === "no_agents_available" ? "no_agents_available" : null,
  };
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
    .select("id, organization_id, created_by, assigned_to, routing_override, priority, status, created_at, resolved_at, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due, metadata")
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
        // previousAssignee is null by construction: this branch only runs on a
        // ticket the guarded UPDATE found still unassigned.
        await notifyTicketAssigned(svc, {
          ticketId,
          ticketNumber: assignedTicket.ticket_number,
          previousAssignee: null,
          nextAssignee: assignedTicket.assigned_to,
        });
      }
    } else if (assignment.unassignedReason === "no_agents_available") {
      // Triage knows what the ticket is about and still found nobody to hand
      // it to. Record why, merging rather than replacing so VIP flags and any
      // other metadata written elsewhere survive.
      const existing =
        currentTicket.metadata && typeof currentTicket.metadata === "object" && !Array.isArray(currentTicket.metadata)
          ? (currentTicket.metadata as Record<string, unknown>)
          : {};
      await svc
        .from("tickets")
        .update({ metadata: { ...existing, routing_status: ROUTING_AWAITING_AVAILABILITY } })
        .eq("id", ticketId)
        .eq("organization_id", orgId)
        .is("assigned_to", null)
        .is("deleted_at", null);
    }
  }
}
