import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";

type CleanupAction = "delete" | "restore";

export async function POST(request: Request) {
  const supabase = await createClient();
  const svc = createServiceClientStatic();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: CleanupAction; ticket_ids?: string[]; all?: boolean; confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.action || !["delete", "restore"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid cleanup action" }, { status: 400 });
  }
  const ticketIds = [...new Set((body.ticket_ids ?? []).filter((id) => typeof id === "string" && id.length > 0))];
  if (!body.all && ticketIds.length === 0) {
    return NextResponse.json({ error: "Select at least one ticket" }, { status: 400 });
  }
  if (ticketIds.length > 500) return NextResponse.json({ error: "Maximum batch size is 500" }, { status: 400 });
  const expectedConfirmation = body.all ? (body.action === "delete" ? "DELETE ALL" : "RESTORE ALL") : body.action.toUpperCase();
  if (body.confirmation !== expectedConfirmation) {
    return NextResponse.json({ error: `Confirmation must be ${expectedConfirmation}` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch = body.action === "delete"
    ? { deleted_at: now, deleted_by: user.id }
    : { deleted_at: null, deleted_by: null };
  let affected = 0;
  let singleResourceId: string | null = null;
  let error: { message: string } | null = null;

  if (body.all) {
    let countQuery = svc
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id);
    countQuery = body.action === "delete" ? countQuery.is("deleted_at", null) : countQuery.not("deleted_at", "is", null);
    const { count, error: countError } = await countQuery;
    if (countError) return NextResponse.json({ error: "Ticket selection failed" }, { status: 500 });
    affected = count ?? 0;
    if (affected === 0) return NextResponse.json({ affected: 0 });

    let updateAll = svc.from("tickets").update(patch).eq("organization_id", profile.organization_id);
    updateAll = body.action === "delete" ? updateAll.is("deleted_at", null) : updateAll.not("deleted_at", "is", null);
    ({ error } = await updateAll);
  } else {
    let selection = svc.from("tickets").select("id").eq("organization_id", profile.organization_id).in("id", ticketIds);
    selection = body.action === "delete" ? selection.is("deleted_at", null) : selection.not("deleted_at", "is", null);
    const { data: selected, error: selectionError } = await selection.limit(500);
    if (selectionError) return NextResponse.json({ error: "Ticket selection failed" }, { status: 500 });
    const selectedIds = (selected ?? []).map((ticket) => ticket.id);
    affected = selectedIds.length;
    if (affected === 0) return NextResponse.json({ affected: 0 });
    singleResourceId = affected === 1 ? selectedIds[0] : null;
    ({ error } = await svc.from("tickets").update(patch).eq("organization_id", profile.organization_id).in("id", selectedIds));
  }
  if (error) return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });

  await svc.from("ticket_audit_logs").insert({
    organization_id: profile.organization_id,
    actor_id: user.id,
    actor_role: profile.role,
    action: body.action === "delete" ? "ticket.soft_deleted" : "ticket.restored",
    resource_type: "ticket",
    resource_id: singleResourceId,
    old_values: null,
    new_values: { affected, bulk: affected > 1 },
  });

  return NextResponse.json({ affected });
}
