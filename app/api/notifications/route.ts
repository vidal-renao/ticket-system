import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClientStatic();
  const [
    { data: notifications, error: notificationsError },
    { count, error: countError },
    { count: inboxUnreadCount },
  ] = await Promise.all([
    svc
      .from("hd_notifications")
      .select("id, ticket_id, type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    svc
      .from("hd_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    svc
      .from("hd_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .eq("type", "comment.public"),
  ]);

  if (notificationsError || countError) {
    return NextResponse.json(
      {
        error:
          notificationsError?.message ??
          countError?.message ??
          "Failed to load notifications",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: count ?? 0,
    inboxUnreadCount: inboxUnreadCount ?? 0,
  });
}

/** Mark every unread notification as read for the current user ("Mark all read"). */
export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClientStatic();
  await svc
    .from("hd_notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ ok: true });
}
