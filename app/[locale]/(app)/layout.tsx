import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

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
  const { data: profile, error: profileError } = await svc
    .from("hd_profiles")
    .select("full_name, role, specialty, avatar_url, availability_status, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // If the query errors (e.g. availability_status column not yet migrated), fall back
  // to a minimal select so login still works before the migration is applied.
  const resolvedProfile = profile ?? (profileError
    ? (await svc.from("hd_profiles").select("full_name, role, specialty, avatar_url, organization_id").eq("id", user.id).maybeSingle()).data
    : null);

  if (!resolvedProfile) redirect(loginPath);

  const resolvedName =
    resolvedProfile.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "User";

  let resolvedSubtitle: string =
    resolvedProfile.role === "agent"
      ? resolvedProfile.specialty?.trim() || "General support"
      : resolvedProfile.role;

  // Companies see their company identity and sector next to the name.
  if (resolvedProfile.role === "customer") {
    const { data: companyInfo } = await svc
      .from("hd_customers_info")
      .select("company_name, industry")
      .eq("id", user.id)
      .maybeSingle();
    if (companyInfo?.company_name?.trim()) {
      resolvedSubtitle = [companyInfo.company_name.trim(), companyInfo.industry?.trim()]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const [{ data: notifications }, { count: unreadNotifications }, assignedCountResult, { count: inboxUnreadCount }] = await Promise.all([
    svc
      .from("hd_notifications")
      .select("id, ticket_id, type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    svc
      .from("hd_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    ["agent", "manager", "admin"].includes(resolvedProfile.role)
      ? svc
          .from("hd_tickets")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id)
          .in("status", ACTIVE_TICKET_STATUSES)
      : Promise.resolve({ count: 0 }),
    svc
      .from("hd_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .eq("type", "comment.public"),
  ]);

  return (
    <AppShell
      role={resolvedProfile.role}
      userName={resolvedName}
      userSubtitle={resolvedSubtitle}
      userAvatar={resolvedProfile.avatar_url}
      userStatus={profile?.availability_status ?? null}
      queueCount={assignedCountResult.count ?? 0}
      locale={locale}
      notifications={notifications ?? []}
      unreadNotifications={unreadNotifications ?? 0}
      inboxUnreadCount={inboxUnreadCount ?? 0}
    >
      {children}
    </AppShell>
  );
}
