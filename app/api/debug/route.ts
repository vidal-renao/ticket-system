import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "no_session", error: userError?.message ?? null });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    status: "ok",
    user: { id: user.id, email: user.email, confirmed: user.confirmed_at != null },
    profile: profile ?? null,
    profileError: profileError?.message ?? null,
  });
}
