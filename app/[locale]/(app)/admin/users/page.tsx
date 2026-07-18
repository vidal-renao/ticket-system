import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "User Management" };
}

export default async function AdminUsersPage({
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
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile || !["admin", "manager"].includes(profile.role)) {
    redirect(locale === "de" ? "/tickets" : `/${locale}/tickets`);
  }
  const orgId = profile.organization_id!;

  const [{ data: profilesRaw }, { data: teamsRaw }, { data: authUsers }] = await Promise.all([
    svc
      .from("profiles")
      .select("id, full_name, role, specialty, availability_status, is_active, avatar_url")
      .eq("organization_id", orgId)
      .order("role")
      .order("full_name"),
    svc.from("teams").select("id, name").eq("organization_id", orgId).order("name"),
    profile.role === "admin"
      ? svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
      : Promise.resolve({ data: { users: [] } }),
  ]);

  // Fetch customer company names
  const customerIds = (profilesRaw ?? [])
    .filter((profileRow) => profileRow.role === "customer")
    .map((profileRow) => profileRow.id);

  const { data: customerInfosRaw } = customerIds.length
    ? await svc.from("customers_info").select("id, company_name").in("id", customerIds)
    : { data: [] };

  const companyById: Record<string, string | null> = Object.fromEntries(
    (customerInfosRaw ?? []).map((customerInfo) => [customerInfo.id, customerInfo.company_name])
  );

  const users = (profilesRaw ?? []).map((profileRow) => ({
    ...profileRow,
    company_name: companyById[profileRow.id] ?? null,
    email: authUsers?.users.find((authUser) => authUser.id === profileRow.id)?.email ?? null,
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Users className="w-5 h-5 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">User Management</h1>
      </div>

      <UserManagementPanel
        users={users}
        teams={teamsRaw ?? []}
        currentUserId={user.id}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
