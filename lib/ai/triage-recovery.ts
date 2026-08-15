import { createServiceClientStatic } from "@/lib/supabase/server";
import { runAITriage } from "@/lib/ai/triage-runner";

/**
 * Recovery sweep for tickets whose AI triage never landed.
 *
 * Triage runs as a background task after the creation response is sent. If the
 * function instance ends before it settles, the ticket keeps no `ai_analysis`
 * row at all — not even the failure-path row runAITriage writes when the model
 * call throws — and the detail page shows "Processing…" indefinitely. TK-0073
 * sat in that state for weeks because nothing re-checked.
 *
 * This makes the gap self-healing instead of permanent.
 */

/** Triage itself times out at 30s, so anything older is not still in flight. */
export const TRIAGE_STALE_AFTER_MINUTES = 15;

/**
 * Bounded per run: the sweep shares the cron's 60s budget with the SLA pass and
 * each recovery is a real model call. A backlog drains over consecutive runs
 * rather than blowing the time limit or the API bill in one.
 */
export const TRIAGE_RECOVERY_BATCH = 5;

export interface TriageRecoveryResult {
  candidates: number;
  recovered: number;
  failed: number;
}

export async function recoverMissingTriage(
  svc: ReturnType<typeof createServiceClientStatic>,
  options: { olderThanMinutes?: number; limit?: number } = {}
): Promise<TriageRecoveryResult> {
  const olderThanMinutes = options.olderThanMinutes ?? TRIAGE_STALE_AFTER_MINUTES;
  const limit = options.limit ?? TRIAGE_RECOVERY_BATCH;
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  const { data: recent, error } = await svc
    .from("hd_tickets")
    .select("id, title, description, priority, organization_id, created_by")
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !recent?.length) {
    if (error) console.error("[triage-recovery] ticket scan failed:", error.message);
    return { candidates: 0, recovered: 0, failed: 0 };
  }

  // ai_analysis has no organization column, so the orphan check is a second
  // pass over the ids rather than a join.
  const { data: analysed } = await svc
    .from("hd_ai_analysis")
    .select("ticket_id")
    .in("ticket_id", recent.map((ticket) => ticket.id));

  const analysedIds = new Set((analysed ?? []).map((row) => row.ticket_id));
  const orphans = recent.filter((ticket) => !analysedIds.has(ticket.id));

  let recovered = 0;
  let failed = 0;

  for (const ticket of orphans.slice(0, limit)) {
    try {
      await runAITriage(
        ticket.id,
        ticket.title,
        ticket.description,
        ticket.organization_id,
        ticket.priority,
        ticket.created_by
      );
      recovered += 1;
    } catch (err) {
      // One bad ticket must not abort the sweep for the rest.
      failed += 1;
      console.error("[triage-recovery] retry failed for ticket", ticket.id, err);
    }
  }

  return { candidates: orphans.length, recovered, failed };
}
