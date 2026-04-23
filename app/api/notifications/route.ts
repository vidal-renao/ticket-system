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
  const [{ data: notifications, error: notificationsError }, { count, error: countError }] = await Promise.all([
    svc
      .from("notifications")
      .select("id, ticket_id, type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    svc
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  if (notificationsError || countError) {
    return NextResponse.json(
      { error: notificationsError?.message ?? countError?.message ?? "Failed to load notifications" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: count ?? 0,
  });
}
