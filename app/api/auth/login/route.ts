import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeRole } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email    = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // Capture cookies to set — same pattern as the Supabase middleware
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

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  // Use service client to bypass RLS — auth already verified above via signInWithPassword.
  // The anon client blocks profile reads when organization_id is NULL (RLS NULL = NULL issue).
  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, customer_status, disabled_at")
    .eq("id", user.id)
    .single();

  if (profile?.disabled_at) {
    return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  }

  // Detect locale from cookie (set by next-intl middleware)
  const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "de";
  const prefix = locale === "de" ? "" : `/${locale}`;

  const role = normalizeRole(profile?.role);
  if (role === "customer" && profile?.customer_status !== "active") {
    return NextResponse.json({ error: "Customer account pending approval" }, { status: 403 });
  }
  const dest =
    role === "customer" ? `${prefix}/tickets` :
    role === "employee" ? `${prefix}/queue`   :
    `${prefix}/dashboard`;

  // Return JSON with redirect destination — cookies attached explicitly.
  // Client will navigate via window.location.href after receiving this response,
  // ensuring Set-Cookie headers are stored before the navigation happens.
  const response = NextResponse.json({ redirectTo: dest });
  for (const { name, value, options } of cookiesToSet) {
    // Force path="/" so the cookie is sent to all routes (not just /api/auth/login)
    response.cookies.set(name, value, { path: "/", ...options });
  }

  return response;
}
