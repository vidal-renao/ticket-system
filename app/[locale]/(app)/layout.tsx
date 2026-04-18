import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  // Use service client to bypass RLS on profiles — auth is already verified above.
  // This prevents redirect loops when profiles RLS policies are misconfigured.
  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect(loginPath);

  return (
    <AppShell
      role={profile.role}
      userName={profile.full_name ?? user.email ?? "User"}
      locale={locale}
    >
      {children}
    </AppShell>
  );
}
