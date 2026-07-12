import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

// Paths that do not require authentication (locale-suffix matched).
const AUTH_PATHS = ["/login", "/register", "/home", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // API routes and static assets must bypass i18n/auth middleware.
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(path)
  ) {
    return NextResponse.next();
  }

  const i18nResponse = handleI18nRouting(request);

  if (i18nResponse.status === 301 || i18nResponse.status === 302) {
    return i18nResponse;
  }

  const isPublicPath = AUTH_PATHS.some((publicPath) => path.endsWith(publicPath));
  const isRoot =
    path === "/" || routing.locales.some((locale) => path === `/${locale}`);

  if (isPublicPath || isRoot) {
    return i18nResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse("Service unavailable", { status: 503 });
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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

  if (!user && !isPublicPath && !isRoot) {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
