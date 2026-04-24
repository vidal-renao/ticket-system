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
    .select("full_name, role, specialty, avatar_url, availability_status")
    .eq("id", user.id)
    .single();

  if (!profile) redirect(loginPath);

  const resolvedName =
    profile.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "User";

  const resolvedSubtitle =
    profile.role === "agent"
      ? profile.specialty?.trim() || "General support"
      : profile.role;

  const [{ data: notifications }, { count: unreadNotifications }, assignedCountResult] = await Promise.all([
    svc
      .from("notifications")
      .select("id, ticket_id, type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    svc
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    ["agent", "manager", "admin"].includes(profile.role)
      ? svc
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id)
          .in("status", ["open", "in_progress", "pending_customer"])
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <AppShell
      role={profile.role}
      userName={resolvedName}
      userSubtitle={resolvedSubtitle}
      userAvatar={profile.avatar_url}
      userStatus={profile.availability_status}
      queueCount={assignedCountResult.count ?? 0}
      locale={locale}
      notifications={notifications ?? []}
      unreadNotifications={unreadNotifications ?? 0}
    >
      {children}
    </AppShell>
  );
}
