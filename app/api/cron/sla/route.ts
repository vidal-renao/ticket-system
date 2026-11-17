import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { SLA_TICKET_COLUMNS, applySlaAssessment, ensureSlaDeadlines, type SlaTicketState } from "@/lib/sla";
import { verifyBearerSecret } from "@/lib/security/bearer-auth";
import { recoverMissingTriage } from "@/lib/ai/triage-recovery";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

type ServiceClient = ReturnType<typeof createServiceClientStatic>;

const JOB = "sla";
const PAGE_SIZE = 200;
const CONCURRENCY = 10;
// maxDuration is 60s (vercel.json). The sweep yields at 45s so the auto-close
// pass still fits; triage recovery, which makes model calls, is skipped once
// 50s have gone. Whatever is left is picked up by the next run, five minutes
// later.
const SWEEP_BUDGET_MS = 45_000;
const RUN_BUDGET_MS = 50_000;

/**
 * SLA sweep, auto-close and triage recovery.
 *
 * Called every five minutes by pg_cron (202611170002) and once a day by the
 * Vercel cron kept as a backup. Both present CRON_SECRET as a bearer token;
 * without a configured secret the route fails closed with 503.
 *
 * This is the one place that reads tickets of every organization on purpose:
 * it is a system job, not a user request. Each write it causes is still
 * pinned to the ticket's own organization inside lib/sla.ts.
 */
export async function GET(request: Request) {
  const authorization = verifyBearerSecret(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const svc = createServiceClientStatic();

  let cursor = await readCursor(svc);
  let assessed = 0;
  let breached = 0;
  let failed = 0;
  let pages = 0;
  let completed = false;

  sweep: while (elapsed() < SWEEP_BUDGET_MS) {
    // Keyset pagination: stable under concurrent inserts and never re-reads a
    // page, unlike OFFSET. Ordered by the primary key.
    let query = svc
      .from("hd_tickets")
      .select(SLA_TICKET_COLUMNS)
      .in("status", ACTIVE_TICKET_STATUSES)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);

    const { data, error } = await query;
    if (error) {
      console.error("[cron/sla] ticket scan failed", error.message);
      return NextResponse.json({ error: "SLA sweep failed" }, { status: 500 });
    }

    const page = (data ?? []) as unknown as SlaTicketState[];
    pages += 1;

    for (let index = 0; index < page.length; index += CONCURRENCY) {
      if (elapsed() >= SWEEP_BUDGET_MS) break sweep;

      const chunk = page.slice(index, index + CONCURRENCY);
      const outcomes = await Promise.all(
        chunk.map(async (ticket) => {
          try {
            const withDeadlines = await ensureSlaDeadlines(svc, ticket);
            return await applySlaAssessment(svc, withDeadlines, null, "system");
          } catch (cause) {
            console.error("[cron/sla] ticket assessment failed", {
              ticketId: ticket.id,
              error: cause instanceof Error ? cause.message : "unknown",
            });
            return null;
          }
        })
      );

      for (const outcome of outcomes) {
        if (!outcome) {
          failed += 1;
          continue;
        }
        assessed += 1;
        if (outcome.breached) breached += 1;
      }
      cursor = chunk[chunk.length - 1].id;
    }

    if (page.length < PAGE_SIZE) {
      completed = true;
      break;
    }
  }

  // A finished pass starts over from the first ticket next time; an
  // interrupted one resumes after the last ticket it handled.
  await writeCursor(svc, completed ? null : cursor);

  const autoClosed = await autoCloseConfirmedResolutions(svc);

  // Tickets whose creation-time triage never landed are picked up here, so a
  // dropped background task self-heals on the next run instead of leaving the
  // ticket reading "Processing…" forever.
  const triageRecovery = elapsed() < RUN_BUDGET_MS ? await recoverMissingTriage(svc) : null;

  return NextResponse.json({
    ok: true,
    assessed,
    breached,
    failed,
    pages,
    completed,
    autoClosed,
    triageRecovery,
  });
}

/**
 * Where the previous run stopped, or null to start from the first ticket.
 *
 * Tolerates the table not existing: the code is deployed before the migration
 * that creates it, and until then every run simply starts at the beginning.
 */
async function readCursor(svc: ServiceClient): Promise<string | null> {
  try {
    const { data, error } = await svc
      .from("hd_cron_state")
      .select("cursor")
      .eq("job", JOB)
      .maybeSingle();
    if (error) return null;
    return (data?.cursor as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

async function writeCursor(svc: ServiceClient, cursor: string | null): Promise<void> {
  try {
    const { error } = await svc
      .from("hd_cron_state")
      .upsert({ job: JOB, cursor, updated_at: new Date().toISOString() }, { onConflict: "job" });
    if (error) console.warn("[cron/sla] cursor not stored", error.code ?? "unknown");
  } catch {
    console.warn("[cron/sla] cursor not stored", "exception");
  }
}

const AUTO_CLOSE_AFTER_HOURS = 48;

/**
 * Resolved tickets the customer neither confirmed nor reopened within the 48h
 * window are closed automatically, mirroring the customer reopen window so
 * tickets never linger in `resolved` forever.
 */
async function autoCloseConfirmedResolutions(
  svc: ServiceClient
): Promise<number> {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_AFTER_HOURS * 3_600_000).toISOString();
  const now = new Date().toISOString();

  const { data: stale } = await svc
    .from("hd_tickets")
    .select("id, organization_id")
    .eq("status", "resolved")
    .is("deleted_at", null)
    .not("resolved_at", "is", null)
    .lt("resolved_at", cutoff)
    .limit(200);

  if (!stale?.length) return 0;

  const ids = stale.map((ticket) => ticket.id);
  const { error } = await svc
    .from("hd_tickets")
    .update({ status: "closed", closed_at: now })
    .in("id", ids)
    .eq("status", "resolved")
    .is("deleted_at", null);

  if (error) {
    console.error("[cron/sla] auto-close failed", error.message);
    return 0;
  }

  await Promise.all(
    stale.map((ticket) =>
      svc.from("hd_ticket_audit_logs").insert({
        organization_id: ticket.organization_id,
        actor_id: null,
        actor_role: "system",
        action: "ticket.auto_closed",
        resource_type: "ticket",
        resource_id: ticket.id,
        old_values: { status: "resolved" },
        new_values: { status: "closed", closed_at: now },
      })
    )
  );

  return ids.length;
}

