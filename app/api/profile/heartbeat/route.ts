import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Liveness heartbeat sent by the app shell every minute while a tab is open
 * and visible. Only proves the client is alive — it never changes the
 * self-declared availability status.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const svc = createServiceClientStatic();
  const { error } = await svc
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    // Pre-migration schema without last_seen_at: report ok so clients do not retry-loop.
    return NextResponse.json({ ok: false, degraded: true });
  }

  return NextResponse.json({ ok: true });
}
