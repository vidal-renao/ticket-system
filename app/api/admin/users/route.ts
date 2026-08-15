import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage, passwordSchema } from "@/lib/validation/security";
import { generateCif } from "@/lib/tax-id";
import { adoptUnassignedTicketsForNewAgent } from "@/lib/ticket-inheritance";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const { data: adminProfile } = await svc
    .from("hd_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    name?: string;
    email?: string;
    password?: string;
    type?: "agent" | "customer";
    team_id?: string;
    specialty?: string;
    company_name?: string;
    industry?: string;
    tax_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, password, type } = body;
  if (!name?.trim() || !email?.trim() || !password || !type || !["agent", "customer"].includes(type)) {
    return NextResponse.json(
      { error: "name, email, password and type are required" },
      { status: 400 }
    );
  }
  const passwordValidation = passwordSchema.safeParse(password);
  if (!passwordValidation.success) {
    return NextResponse.json(
      { error: passwordValidation.error.issues[0]?.message ?? "Password does not meet policy" },
      { status: 400 }
    );
  }

  // admin.createUser() does NOT affect the current admin session
  const { data: newUserData, error: createError } = await svc.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: name.trim() },
  });

  if (createError || !newUserData?.user) {
    return NextResponse.json(
      { error: normalizeSupabaseErrorMessage(createError) },
      { status: 400 }
    );
  }

  const userId = newUserData.user.id;
  const role = type === "customer" ? "customer" : "agent";

  // Resolve team/specialty BEFORE writing the profile so both land in a
  // single write — a prior two-step version (base profile, then a follow-up
  // update for team_id/specialty) could silently leave a new agent
  // unrouted if anything interrupted the second call.
  let resolvedTeamId: string | undefined;
  let resolvedSpecialty: string | undefined;
  if (role === "agent") {
    const requestedTeamId = body.team_id?.trim();
    resolvedSpecialty = body.specialty?.trim() || undefined;

    if (requestedTeamId) {
      const { data: team } = await svc
        .from("teams")
        .select("id, name")
        .eq("id", requestedTeamId)
        .eq("organization_id", adminProfile.organization_id)
        .maybeSingle();
      if (!team) {
        await svc.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: "Invalid team" }, { status: 400 });
      }
      resolvedTeamId = team.id;
      if (!resolvedSpecialty) resolvedSpecialty = team.name;
    }
  }

  const { error: profileError } = await svc
    .from("hd_profiles")
    .upsert(
      {
        id: userId,
        full_name: name.trim(),
        organization_id: adminProfile.organization_id,
        role,
        is_active: true,
        ...(resolvedTeamId ? { team_id: resolvedTeamId } : {}),
        ...(resolvedSpecialty ? { specialty: resolvedSpecialty } : {}),
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("[admin/users] profile error:", profileError.message);
    await svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  // Inherit the backlog: any ticket left unassigned only because no
  // specialist existed for this specialty yet is handed to the new agent now.
  let adoptedCount = 0;
  if (role === "agent" && resolvedSpecialty && adminProfile.organization_id) {
    const adopted = await adoptUnassignedTicketsForNewAgent(svc, {
      organizationId: adminProfile.organization_id,
      agentId: userId,
      actorId: user.id,
      specialty: resolvedSpecialty,
    });
    adoptedCount = adopted.length;
  }

  let taxId: string | null = null;
  if (role === "customer") {
    // Every company gets a fiscal identifier at onboarding: the one provided
    // by the company, or an auto-generated well-formed CIF derived from the
    // company name (replaceable later in Settings → Company profile).
    const companyName = body.company_name?.trim() || name.trim();
    taxId = body.tax_id?.trim() || generateCif(companyName);
    const { error: custError } = await svc.from("hd_customers_info").upsert(
      {
        id: userId,
        company_name: companyName,
        industry: body.industry?.trim() ?? "",
        business_details: "",
        tax_id: taxId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (custError) console.error("[admin/users] customers_info error:", custError.message);
  }

  return NextResponse.json({
    user: { id: userId, email: email.trim(), name: name.trim(), role, tax_id: taxId },
    adoptedTicketCount: adoptedCount,
  });
}
