import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";
import type { UserRole } from "@/lib/supabase/types";

/**
 * Locale root (e.g. /en, /es, /de).
 * - Authenticated users → redirect to their default view.
 * - Unauthenticated users → show the landing page.
 */
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role as UserRole | undefined;
    const prefix = locale === "de" ? "" : `/${locale}`;

    if (role === "customer") redirect(`${prefix}/tickets`);
    redirect(`${prefix}/dashboard`);
  }

  return <LandingPage locale={locale} />;
}
