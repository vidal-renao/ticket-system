import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyBearerSecret } from "@/lib/security/bearer-auth";
import { createServiceClientStatic } from "@/lib/supabase/server";

const setupConfigSchema = z.object({
  adminUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

function authorizeSetup(request: Request) {
  return verifyBearerSecret(request, process.env.SETUP_SECRET);
}

function getSetupConfig() {
  return setupConfigSchema.safeParse({
    adminUserId: process.env.SETUP_ADMIN_USER_ID,
    organizationId: process.env.SETUP_ORGANIZATION_ID,
  });
}

export async function POST(request: Request) {
  const authorization = authorizeSetup(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const config = getSetupConfig();
  if (!config.success) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { adminUserId, organizationId } = config.data;
  const svc = createServiceClientStatic();
  const { data: organization, error: organizationError } = await svc
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .single();

  if (organizationError || !organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { error: profileError } = await svc.from("profiles").upsert(
    {
      id: adminUserId,
      organization_id: organizationId,
      role: "admin",
      is_active: true,
      locale: "de",
      timezone: "Europe/Zurich",
      data_processing_consent: true,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: "Profile upsert failed" }, { status: 500 });
  }

  const { data: profile } = await svc
    .from("profiles")
    .select("id, role, organization_id, is_active")
    .eq("id", adminUserId)
    .single();

  return NextResponse.json({
    ok: true,
    organization: { id: organization.id, name: organization.name },
    profile,
  });
}

export async function GET(request: Request) {
  const authorization = authorizeSetup(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const config = getSetupConfig();
  if (!config.success) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { adminUserId, organizationId } = config.data;
  const svc = createServiceClientStatic();
  const [{ data: organization }, { data: profile }] = await Promise.all([
    svc
      .from("organizations")
      .select("id, name, is_active")
      .eq("id", organizationId)
      .single(),
    svc
      .from("profiles")
      .select("id, role, organization_id, is_active")
      .eq("id", adminUserId)
      .single(),
  ]);

  return NextResponse.json({
    ready: Boolean(
      organization &&
        profile &&
        profile.organization_id === organizationId &&
        profile.role === "admin" &&
        profile.is_active
    ),
  });
}
