import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage, registerSchema } from "@/lib/validation/security";

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  org_code?: string;
  role?: string;
  // Agent fields
  team_id?: string;
  specialty?: string;
  // Customer fields
  company_name?: string;
  industry?: string;
  business_details?: string;
  tax_id?: string;
}

export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid registration payload" },
      { status: 400 }
    );
  }
  const { name, email, password, org_code, role, team_id, specialty, company_name, industry, business_details, tax_id } =
    validation.data;

  const assignedRole = role === "customer" ? "customer" : "agent";

  // Validate org exists
  const svc = createServiceClientStatic();
  const { data: org, error: orgError } = await svc
    .from("organizations")
    .select("id, name")
    .eq("id", org_code.trim())
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: "Organization not found. Check your organization code." },
      { status: 404 }
    );
  }

  // Validate team_id belongs to this org if provided
  if (assignedRole === "agent" && team_id) {
    const { data: team } = await svc
      .from("teams")
      .select("id")
      .eq("id", team_id)
      .eq("organization_id", org.id)
      .single();
    if (!team) {
      return NextResponse.json({ error: "Invalid specialty selection" }, { status: 400 });
    }
  }

  // Create auth user — capture session cookies for immediate login
  const cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          cookiesToSet.push(...cookies);
        },
      },
    }
  );

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() } },
  });

  if (signUpError) {
    return NextResponse.json({ error: normalizeSupabaseErrorMessage(signUpError) }, { status: 400 });
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }

  // Upsert profile with team assignment if agent
  const profileData: Record<string, unknown> = {
    id: userId,
    full_name: name.trim(),
    organization_id: org.id,
    role: assignedRole,
    is_active: true,
  };

  // Persist team assignment + derive specialty from team name
  if (assignedRole === "agent" && team_id) {
    profileData.team_id = team_id;
    // Use explicit specialty if provided, otherwise fall back to team name
    if (specialty?.trim()) {
      profileData.specialty = specialty.trim();
    } else {
      // team was already validated above — org.name is available there but we re-fetch name
      const { data: teamForSpecialty } = await svc
        .from("teams")
        .select("name")
        .eq("id", team_id)
        .single();
      if (teamForSpecialty?.name) profileData.specialty = teamForSpecialty.name;
    }
  }

  const { error: profileError } = await svc
    .from("profiles")
    .upsert(profileData, { onConflict: "id" });

  if (profileError) {
    console.error("[register] profile upsert error:", profileError.message);
  }

  // Insert company info if customer
  if (assignedRole === "customer" && company_name?.trim()) {
    const { error: customerError } = await svc.from("customers_info").upsert(
      {
        id: userId,
        company_name: company_name.trim(),
        industry: industry?.trim() ?? "",
        business_details: business_details?.trim() ?? "",
        tax_id: tax_id?.trim() ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (customerError) {
      console.error("[register] customers_info upsert error:", customerError.message);
    }
  }

  const hasSession = !!signUpData.session;
  const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "de";
  const prefix = locale === "de" ? "" : `/${locale}`;
  const dest = assignedRole === "customer" ? `${prefix}/tickets` : `${prefix}/queue`;

  if (hasSession) {
    const response = NextResponse.json({ redirectTo: dest });
    for (const { name: n, value, options } of cookiesToSet) {
      response.cookies.set(n, value, { path: "/", ...options });
    }
    return response;
  }

  return NextResponse.json({ needsConfirmation: true });
}
