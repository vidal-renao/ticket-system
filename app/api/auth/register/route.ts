import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";

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

  const { name, email, password, org_code, role } = body;

  if (!name?.trim() || !email?.trim() || !password || !org_code?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

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
  if (assignedRole === "agent" && body.team_id) {
    const { data: team } = await svc
      .from("teams")
      .select("id")
      .eq("id", body.team_id)
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
    return NextResponse.json({ error: signUpError.message }, { status: 400 });
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

  // profiles has no team_id / specialty columns — those live in the teams table.
  // The team_id from registration is validated above but not stored here.

  const { error: profileError } = await svc
    .from("profiles")
    .upsert(profileData, { onConflict: "id" });

  if (profileError) {
    console.error("[register] profile upsert error:", profileError.message);
  }

  // Insert company info if customer
  if (assignedRole === "customer" && body.company_name?.trim()) {
    const { error: customerError } = await svc.from("customers_info").upsert(
      {
        id: userId,
        company_name: body.company_name.trim(),
        industry: body.industry?.trim() ?? "",
        business_details: body.business_details?.trim() ?? "",
        tax_id: body.tax_id?.trim() ?? "",
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
