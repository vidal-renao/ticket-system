import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { appUrl } from "@/lib/app-url";

const APP_URL = appUrl();

/**
 * Supabase auth callback — handles email confirmation, password reset, and
 * magic-link flows. Supabase redirects here with ?code=... after the user
 * clicks the link in their email.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const params = new URLSearchParams({
      error: errorDescription ?? error,
    });
    return NextResponse.redirect(new URL(`/login?${params}`, APP_URL));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", APP_URL));
  }

  const cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => { cookiesToSet.push(...cookies); },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const params = new URLSearchParams({ error: exchangeError.message });
    return NextResponse.redirect(new URL(`/login?${params}`, APP_URL));
  }

  const redirectUrl = next.startsWith("/") ? new URL(next, APP_URL) : new URL("/dashboard", APP_URL);
  const response = NextResponse.redirect(redirectUrl);

  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, { path: "/", ...options });
  }

  return response;
}
