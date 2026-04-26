import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";

const ADMIN_UUID = "ee677b39-906f-4027-a01c-69024c8c23f5";
const ORG_UUID = "921f56a8-b2fe-4f24-bae9-fdf4863d4240";
const SETUP_SECRET = process.env.SETUP_SECRET;

/**
 * POST /api/admin/setup
 * Idempotent: ensures the admin profile exists with correct org + role.
 * Protected by SETUP_SECRET env var — call with Authorization: Bearer <secret>
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (SETUP_SECRET && authHeader !== `Bearer ${SETUP_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClientStatic();

  // Ensure the organization exists
  const { data: org, error: orgError } = await svc
    .from("organizations")
    .select("id, name")
    .eq("id", ORG_UUID)
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: "Organization not found", orgId: ORG_UUID, detail: orgError?.message },
      { status: 404 }
    );
  }

  // Upsert the admin profile
  const { error: profileError } = await svc
    .from("profiles")
    .upsert(
      {
        id: ADMIN_UUID,
        organization_id: ORG_UUID,
        role: "admin",
        full_name: "Vidal Reñao",
        is_active: true,
        locale: "de",
        timezone: "Europe/Zurich",
        data_processing_consent: true,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    return NextResponse.json(
      { error: "Profile upsert failed", detail: profileError.message },
      { status: 500 }
    );
  }

  // Verify the result
  const { data: profile } = await svc
    .from("profiles")
    .select("id, role, organization_id, is_active")
    .eq("id", ADMIN_UUID)
    .single();

  return NextResponse.json({
    ok: true,
    organization: { id: org.id, name: org.name },
    profile,
    message: "Admin profile ensured. Admin can now log in.",
  });
}

/** GET /api/admin/setup — diagnostic check */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (SETUP_SECRET && authHeader !== `Bearer ${SETUP_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClientStatic();

  const [{ data: org }, { data: profile }] = await Promise.all([
    svc.from("organizations").select("id, name, is_active").eq("id", ORG_UUID).single(),
    svc.from("profiles").select("id, role, organization_id, is_active, full_name").eq("id", ADMIN_UUID).single(),
  ]);

  return NextResponse.json({
    organization: org ?? null,
    profile: profile ?? null,
    adminUuid: ADMIN_UUID,
    orgUuid: ORG_UUID,
    ready: Boolean(org && profile && profile.organization_id === ORG_UUID && profile.role === "admin"),
  });
}
