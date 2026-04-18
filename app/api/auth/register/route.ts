import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; password?: string; org_code?: string; role?: string };
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

  // Validate org exists via service client
  const svc = createServiceClientStatic();
  const { data: org, error: orgError } = await svc
    .from("organizations")
    .select("id, name")
    .eq("id", org_code.trim())
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: "Organization not found. Check your organization code." }, { status: 404 });
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

  // Upsert profile — handles both trigger-created and missing profiles
  const { error: profileError } = await svc
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: name.trim(),
        organization_id: org.id,
        role: assignedRole,
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("[register] profile upsert error:", profileError.message);
    // Non-fatal: user is created, profile may need manual fix
  }

  // If Supabase returned a session, user is logged in immediately
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

  // Email confirmation required — redirect to login with success message
  return NextResponse.json({ needsConfirmation: true });
}
