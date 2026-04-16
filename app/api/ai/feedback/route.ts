import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Agents can submit feedback on AI suggestions for continuous improvement */
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { ticket_id, category_accepted, priority_accepted, feedback } = body;

  if (!ticket_id) return NextResponse.json({ error: "ticket_id required" }, { status: 400 });

  const { error } = await supabase
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
