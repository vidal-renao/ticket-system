import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { runAITriage } from "@/lib/ai/triage-runner";

export const dynamic = "force-dynamic";

/**
 * Re-runs AI triage on an existing ticket.
 *
 * The triage that runs at creation time is a background task; if the function
 * instance dies before it finishes, the ticket is left with no `ai_analysis`
 * row and the detail page shows "Processing…" forever, with nothing in the
 * product able to move it on. This is that missing door.
 *
 * Admin only, and scoped to the admin's own organization. It runs the real
 * pipeline — the same `runAITriage` the creation route uses — rather than
 * writing analysis rows by hand.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, ticket_number, title, description, priority, created_by, organization_id, deleted_at")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!ticket || ticket.deleted_at) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Re-analysis replaces the previous verdict rather than stacking a second
  // one: every reader of ai_analysis takes the most recent row, and leaving
  // stale rows behind would make the analytics counts drift.
  const { data: previous } = await svc
    .from("ai_analysis")
    .select("id")
    .eq("ticket_id", ticket.id);

  await runAITriage(
    ticket.id,
    ticket.title,
    ticket.description,
    ticket.organization_id,
    ticket.priority,
    ticket.created_by
  );

  const { data: fresh } = await svc
    .from("ai_analysis")
    .select("id, suggested_category, suggested_priority, confidence_score, model_used")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fresh) {
    return NextResponse.json(
      { error: "Triage produced no analysis row" },
      { status: 502 }
    );
  }

  if (previous?.length) {
    await svc
      .from("ai_analysis")
      .delete()
      .eq("ticket_id", ticket.id)
      .in("id", previous.map((row) => row.id));
  }

  await svc.from("ticket_audit_logs").insert({
    organization_id: ticket.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: "ticket.reanalyzed",
    resource_type: "ticket",
    resource_id: ticket.id,
    old_values: { previous_analyses: previous?.length ?? 0 },
    new_values: {
      suggested_category: fresh.suggested_category,
      suggested_priority: fresh.suggested_priority,
      confidence_score: fresh.confidence_score,
      model_used: fresh.model_used,
    },
  });

  return NextResponse.json({ analysis: fresh });
}
