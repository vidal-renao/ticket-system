import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { canViewTicket, getCurrentUserContext, isAdmin, isEmployee } from "@/lib/auth/permissions";

/** Agents can submit feedback on AI suggestions for continuous improvement */
export async function POST(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(ctx) && !isEmployee(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { ticket_id, category_accepted, priority_accepted, feedback } = body;

  if (!ticket_id) return NextResponse.json({ error: "ticket_id required" }, { status: 400 });

  const svc = createServiceClientStatic();
  const { data: ticket } = await svc
    .from("tickets")
    .select("id, organization_id, created_by, assigned_to")
    .eq("id", ticket_id)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (!canViewTicket(ctx, ticket)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc
    .from("ai_analysis")
    .update({
      category_accepted,
      priority_accepted,
      agent_feedback: feedback ?? null,
    })
    .eq("ticket_id", ticket_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
