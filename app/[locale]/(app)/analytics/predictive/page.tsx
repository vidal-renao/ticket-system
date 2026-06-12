import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PredictiveEngine } from "@/components/analytics/PredictiveEngine";
import { getCurrentUserContext, isAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Predictive Analytics" };
}

export default async function PredictivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const ctx = await getCurrentUserContext();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!isAdmin(ctx)) redirect(queuePath);

  return <PredictiveEngine />;
}
