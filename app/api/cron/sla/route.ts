import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { applySlaAssessment, ensureSlaDeadlines } from "@/lib/sla";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["open", "in_progress", "pending_customer", "pending_third_party"];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClientStatic();
  const { data: tickets, error } = await svc
    .from("tickets")
    .select("id, ticket_number, organization_id, priority, status, assigned_to, created_at, resolved_at, first_response_at, first_agent_response_at, sla_first_response_due, sla_resolution_due, response_due_at, resolution_due_at")
    .in("status", ACTIVE_STATUSES)
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

  return NextResponse.json({
    ok: true,
    assessed,
    breached,
  });
}

