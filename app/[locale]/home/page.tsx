import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";
import { landingMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return landingMetadata(locale);
}

/** Public landing page — always accessible, even when authenticated. */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <LandingPage locale={locale} isLoggedIn={!!user} />;
}
