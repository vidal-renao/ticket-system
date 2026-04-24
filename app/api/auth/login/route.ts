import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

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

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (signInError) {
    return NextResponse.json(
      {
        error: signInError.message,
        diagnostic: {
          stage: "signInWithPassword",
          authErrorName: signInError.name ?? null,
          authErrorStatus: "status" in signInError ? signInError.status : null,
          authErrorCode: "code" in signInError ? signInError.code : null,
          cookieCount: cookiesToSet.length,
        },
      },
      { status: 401 }
    );
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (sessionError || !session || !user) {
    return NextResponse.json(
      {
        error: sessionError?.message ?? "Authentication succeeded but no session was returned",
        diagnostic: {
          stage: "post-sign-in-session-check",
          sessionPresent: Boolean(session),
          cookieCount: cookiesToSet.length,
        },
      },
      { status: 401 }
    );
  }

  const svc = createServiceClientStatic();
  const { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      {
        error: "Login succeeded, but no matching profile was found for this user.",
        diagnostic: {
          stage: "profile-lookup",
          profileFound: false,
          sessionPresent: true,
          cookieCount: cookiesToSet.length,
        },
      },
      { status: 409 }
    );
  }

  if (!profile.organization_id) {
    return NextResponse.json(
      {
        error: "Login succeeded, but the profile has no organization assigned.",
        diagnostic: {
          stage: "profile-validation",
          profileFound: true,
          profileRole: profile.role,
          organizationId: profile.organization_id,
          sessionPresent: true,
          cookieCount: cookiesToSet.length,
        },
      },
      { status: 409 }
    );
  }

  const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "de";
  const prefix = locale === "de" ? "" : `/${locale}`;
  const role = profile.role ?? "customer";
  const redirectTo = role === "customer" ? `${prefix}/tickets` : role === "agent" ? `${prefix}/queue` : `${prefix}/dashboard`;

  const response = NextResponse.json({
    redirectTo,
    diagnostic: {
      stage: "ready-to-redirect",
      profileFound: true,
      profileRole: role,
      organizationId: profile.organization_id,
      sessionPresent: true,
      cookieCount: cookiesToSet.length,
      redirectTo,
    },
  });

  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, { path: "/", ...options });
  }

  return response;
}
