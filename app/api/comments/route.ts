import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import {
  canViewCustomerMessages,
  canViewInternalMessages,
  getCurrentUserContext,
} from "@/lib/auth/permissions";

export async function POST(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { ticket_id?: string; content?: string; is_internal?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticket_id, content, is_internal = false } = body;
  if (!ticket_id || !content?.trim()) {
    return NextResponse.json(
      { error: "ticket_id and content are required" },
      { status: 400 }
    );
  }

  const svc = createServiceClientStatic();
  const { data: ticket } = await svc
    .from("tickets")
    .select("id, created_by, organization_id, assigned_to")
    .eq("id", ticket_id)
    .eq("organization_id", ctx.organizationId ?? "00000000-0000-0000-0000-000000000000")
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const wantsInternal = is_internal === true;
  const allowed = wantsInternal
    ? canViewInternalMessages(ctx, ticket)
    : canViewCustomerMessages(ctx, ticket);

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: comment, error } = await svc
    .from("ticket_comments")
    .insert({
      ticket_id,
      author_id: ctx.userId,
      content: content.trim(),
      is_internal: wantsInternal,
    })
    .select("*, profiles(full_name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment }, { status: 201 });
}
