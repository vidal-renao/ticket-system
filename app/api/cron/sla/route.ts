import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { applySlaAssessment, ensureSlaDeadlines } from "@/lib/sla";
import { verifyBearerSecret } from "@/lib/security/bearer-auth";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = verifyBearerSecret(request, process.env.CRON_SECRET);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const svc = createServiceClientStatic();
  const { data: tickets, error } = await svc
    .from("tickets")
    .select("id, ticket_number, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
    .in("status", ACTIVE_TICKET_STATUSES)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let assessed = 0;
  let breached = 0;

  for (const ticket of tickets ?? []) {
    const withDeadlines = await ensureSlaDeadlines(svc, ticket);
    const assessment = await applySlaAssessment(svc, withDeadlines, null, "system");
    assessed += 1;
    if (assessment.breached) breached += 1;
  }

  const autoClosed = await autoCloseConfirmedResolutions(svc);

  return NextResponse.json({
    ok: true,
    assessed,
    breached,
    autoClosed,
  });
}

const AUTO_CLOSE_AFTER_HOURS = 48;

/**
 * Resolved tickets the customer neither confirmed nor reopened within the 48h
 * window are closed automatically, mirroring the customer reopen window so
 * tickets never linger in `resolved` forever.
 */
async function autoCloseConfirmedResolutions(
  svc: ReturnType<typeof createServiceClientStatic>
): Promise<number> {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_AFTER_HOURS * 3_600_000).toISOString();
  const now = new Date().toISOString();

  const { data: stale } = await svc
    .from("tickets")
    .select("id, organization_id")
    .eq("status", "resolved")
    .is("deleted_at", null)
    .not("resolved_at", "is", null)
    .lt("resolved_at", cutoff)
    .limit(200);

  if (!stale?.length) return 0;

  const ids = stale.map((ticket) => ticket.id);
  const { error } = await svc
    .from("tickets")
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
      svc.from("audit_logs").insert({
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

