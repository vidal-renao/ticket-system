import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { PredictiveEngine } from "@/components/analytics/PredictiveEngine";

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

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", user.id).single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) redirect(queuePath);

  return <PredictiveEngine />;
}
