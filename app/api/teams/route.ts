import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";

/** Public endpoint — returns teams for an org by UUID (used in registration form). */
export async function GET(request: NextRequest) {
  const orgCode = request.nextUrl.searchParams.get("org_code")?.trim();
  if (!orgCode) return NextResponse.json({ teams: [] });

  const svc = createServiceClientStatic();
  const { data: org } = await svc
    .from("organizations")
    .select("id")
    .eq("id", orgCode)
    .single();

  if (!org) return NextResponse.json({ teams: [] });

  const { data: teams } = await svc
    .from("teams")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name");

  return NextResponse.json({ teams: teams ?? [] });
}
