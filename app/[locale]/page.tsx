import { redirect } from "next/navigation";

/**
 * Locale root (e.g. /en, /es).
 * The default locale root (/) is handled by app/page.tsx.
 * next-intl redirects non-default-locale visitors here; forward them to login.
 */
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // For default locale (de) next-intl uses no prefix, so /login is correct.
  // For other locales (en, es) the middleware will handle the prefix.
  redirect(locale === "de" ? "/login" : `/${locale}/login`);
}
