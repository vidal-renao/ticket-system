import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

/** Paths that don't require authentication (locale-suffix matched) */
const AUTH_PATHS = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── 1. Hard bypass: API routes and static assets ──────────────────────────
  // API routes MUST NOT go through i18n routing — next-intl would prefix them
  // with the locale (/en/api/...) causing 404s on all API calls.
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(path)
  ) {
    return NextResponse.next();
  }

  // ── 2. i18n routing ────────────────────────────────────────────────────────
  const i18nResponse = handleI18nRouting(request);

  // Honour locale detection redirects immediately (301/302)
  if (i18nResponse.status === 301 || i18nResponse.status === 302) {
    return i18nResponse;
  }

  // ── 3. Supabase session refresh ───────────────────────────────────────────
  // Attach refreshed session cookies to the i18n response (not a new response)
  // to avoid losing the x-next-intl-locale header set by handleI18nRouting.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            i18nResponse.cookies.set(name, value, { path: "/", ...options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 4. Auth guard ─────────────────────────────────────────────────────────
  const isPublicPath = AUTH_PATHS.some((p) => path.endsWith(p));
  const isRoot = path === "/";

  if (!user && !isPublicPath && !isRoot) {
    // Derive locale from the i18n response header (most reliable source)
    const locale =
      i18nResponse.headers.get("x-next-intl-locale") ??
      request.cookies.get("NEXT_LOCALE")?.value ??
      routing.defaultLocale;

    const loginPath =
      locale === routing.defaultLocale ? "/login" : `/${locale}/login`;

    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  return i18nResponse;
}

export const config = {
  // Exclude: static files, images, api routes — they must NOT be touched by i18n middleware
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
