import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Service client bypasses RLS — identity already verified via getUser()
  const svc = createServiceClientStatic();

  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const isStaff = ["agent", "manager", "admin"].includes(profile.role);

  // Verify ticket exists and belongs to org (multi-tenant isolation)
  const { data: ticket } = await svc
    .from("tickets")
    .select("id, created_by, organization_id")
    .eq("id", ticket_id)
    .eq("organization_id", profile.organization_id ?? "00000000-0000-0000-0000-000000000000")
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Customers can only comment on their own tickets
  if (profile.role === "customer" && ticket.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: comment, error } = await svc
    .from("ticket_comments")
    .insert({
      ticket_id,
      author_id: user.id,
      content: content.trim(),
      is_internal: isStaff && is_internal,
    })
    .select("*, profiles(full_name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment }, { status: 201 });
}
