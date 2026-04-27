import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

/** Called by navigator.sendBeacon on tab/window close to set status offline. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const svc = createServiceClientStatic();
  await svc.from("profiles").update({ availability_status: "offline" }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
