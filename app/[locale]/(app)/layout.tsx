import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUserContext } from "@/lib/auth/permissions";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  const ctx = await getCurrentUserContext();

  if (!ctx) redirect(loginPath);

  return (
    <AppShell
      role={ctx.role}
      userName={ctx.email ?? "User"}
      locale={locale}
    >
      {children}
    </AppShell>
  );
}
