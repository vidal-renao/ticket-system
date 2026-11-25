import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/**
 * Search metadata for the public surface.
 *
 * The landing page exists once per locale (`/`, `/en`, `/es`, with German
 * unprefixed under localePrefix "as-needed"). Without canonical and hreflang
 * links a crawler sees three unrelated pages with the same layout; with them it
 * sees one page in three languages. `/[locale]/home` renders the same landing
 * and canonicalises to the locale root.
 */

export function localeRootPath(locale: string): string {
  return locale === routing.defaultLocale ? "/" : `/${locale}`;
}

/** hreflang map, relative to metadataBase; x-default is the German root. */
export function localeAlternates(): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((locale) => [locale, localeRootPath(locale)])),
    "x-default": localeRootPath(routing.defaultLocale),
  };
}

export function landingMetadata(locale: string): Metadata {
  return {
    alternates: {
      canonical: localeRootPath(locale),
      languages: localeAlternates(),
    },
  };
}

/**
 * Sign-in, registration and password screens: reachable, but not results
 * anyone should land on from a search engine. `follow` stays on so the links
 * back to the landing page still count.
 */
export const AUTH_SCREEN_ROBOTS: Metadata["robots"] = { index: false, follow: true };
