import { NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { canManageUsers, getCurrentUserContext } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  if (!canManageUsers(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    name?: string;
    email?: string;
    password?: string;
    type?: "employee" | "agent" | "customer";
    team_id?: string;
    specialty?: string;
    company_name?: string;
    industry?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, password, type } = body;
  if (!name?.trim() || !email?.trim() || !password || !type) {
    return NextResponse.json(
      { error: "name, email, password and type are required" },
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
      { error: createError?.message ?? "Failed to create user" },
      { status: 400 }
    );
  }

  const userId = newUserData.user.id;
  const role = type === "customer" ? "customer" : "employee";

  // Step 1: save base profile (columns that always exist)
  const { error: profileError } = await svc
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: name.trim(),
        organization_id: ctx.organizationId,
        role,
        is_active: true,
        customer_status: "active",
        approved_at: new Date().toISOString(),
        approved_by: ctx.userId,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("[admin/users] profile error:", profileError.message);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  // Step 2: try to set team_id / specialty — may fail if migration hasn't run yet
  if (role === "employee" && (body.team_id?.trim() || body.specialty?.trim())) {
    const extended: Record<string, unknown> = {};
    if (body.team_id?.trim()) {
      extended.team_id = body.team_id.trim();
      if (body.specialty?.trim()) {
        extended.specialty = body.specialty.trim();
      } else {
        const { data: team } = await svc
          .from("teams")
          .select("name")
          .eq("id", body.team_id.trim())
          .single();
        if (team?.name) extended.specialty = team.name;
      }
    } else if (body.specialty?.trim()) {
      extended.specialty = body.specialty.trim();
    }
    const { error: extErr } = await svc
      .from("profiles")
      .update(extended)
      .eq("id", userId);
    if (extErr) console.warn("[admin/users] extended fields not saved (migration pending?):", extErr.message);
  }

  if (role === "customer" && body.company_name?.trim()) {
    const { error: custError } = await svc.from("customers_info").upsert(
      {
        id: userId,
        company_name: body.company_name.trim(),
        industry: body.industry?.trim() ?? "",
        business_details: "",
        tax_id: "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (custError) console.error("[admin/users] customers_info error:", custError.message);
  }

  return NextResponse.json({
    user: { id: userId, email: email.trim(), name: name.trim(), role },
  });
}
