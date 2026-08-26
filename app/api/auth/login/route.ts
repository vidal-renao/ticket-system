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

  console.log("[auth/login] signInWithPassword result", {
    email: email.trim().toLowerCase(),
    hasError: Boolean(signInError),
    cookieNamesAfterSignIn: cookiesToSet.map((cookie) => cookie.name),
    cookieCountAfterSignIn: cookiesToSet.length,
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
    console.log("[auth/login] missing session after sign-in", {
      email: email.trim().toLowerCase(),
      sessionError: sessionError?.message ?? null,
      sessionPresent: Boolean(session),
      userPresent: Boolean(user),
      cookieNamesAfterSessionCheck: cookiesToSet.map((cookie) => cookie.name),
    });
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
    .from("hd_profiles")
    .select("role, organization_id, is_active, deleted_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.log("[auth/login] missing profile after sign-in", {
      email: email.trim().toLowerCase(),
      userId: user.id,
      profileError: profileError?.message ?? null,
    });
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

  // A frozen or deleted account should never have got a password past GoTrue
  // -- both carry a ban. This is the second lock, and it exists because the
  // first one lives in a different system: a ban that failed to apply, was
  // lifted directly in the dashboard, or predates this feature would otherwise
  // let someone straight in. It costs one column on a query that already runs.
  if (profile.deleted_at || profile.is_active === false) {
    console.log("[auth/login] refused a closed account", {
      email: email.trim().toLowerCase(),
      userId: user.id,
      deleted: Boolean(profile.deleted_at),
    });
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error: "This account has been closed. Please contact your administrator.",
        diagnostic: {
          stage: "account-status",
          // Frozen and deleted are not distinguished to the caller: which one
          // it is tells an outsider something about the account, and the
          // remedy is the same conversation either way.
          accountClosed: true,
        },
      },
      { status: 403 }
    );
  }

  if (!profile.organization_id) {
    console.log("[auth/login] profile without organization", {
      email: email.trim().toLowerCase(),
      userId: user.id,
      role: profile.role,
    });
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

  // Mark user as online on successful login (staff only)
  if (["agent", "manager", "admin"].includes(profile.role)) {
    await svc.from("hd_profiles").update({ availability_status: "online" }).eq("id", user.id);
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

  console.log("[auth/login] response ready", {
    email: email.trim().toLowerCase(),
    userId: user.id,
    role,
    redirectTo,
    responseCookieNames: cookiesToSet.map((cookie) => cookie.name),
    responseCookieCount: cookiesToSet.length,
    requestCookieNames: request.cookies.getAll().map((cookie) => cookie.name),
  });

  return response;
}
