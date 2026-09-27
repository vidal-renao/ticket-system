import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { localeAlternates, localeRootPath } from "@/lib/seo";
import { routing } from "@/i18n/routing";

// Only pages an anonymous visitor can read. Sign-in screens are noindex and
// the application routes redirect to /login, so listing either would only
// hand crawlers a redirect.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const languages = Object.fromEntries(
    Object.entries(localeAlternates()).map(([lang, path]) => [lang, `${base}${path}`])
  );

  return routing.locales.map((locale) => ({
    url: `${base}${localeRootPath(locale)}`,
    changeFrequency: "monthly",
    priority: locale === routing.defaultLocale ? 1 : 0.8,
    alternates: { languages },
  }));
}
