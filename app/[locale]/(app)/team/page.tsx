import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Users, UserCheck, Building2 } from "lucide-react";
import type { UserRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("team");
  return { title: t("title") };
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin:    "text-red-400 bg-red-500/10 border-red-500/20",
  manager:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  agent:    "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  customer: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("team");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  // Team is only visible to managers and admins
  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) {
    redirect(queuePath);
  }

  if (!profile.organization_id) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("noMembers")}</p>
      </div>
    );
  }

  const orgId = profile.organization_id;

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, department, is_active, created_at")
    .eq("organization_id", orgId)
    .order("role")
    .order("full_name");

  const typedMembers = (members ?? []) as ProfileRow[];

  const byRole = typedMembers.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  const activeCount  = typedMembers.filter((m) => m.is_active).length;
  const totalCount   = typedMembers.length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Users className="w-5 h-5 text-indigo-400" />}
          label={t("totalMembers")}
          value={totalCount}
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5 text-green-400" />}
          label={t("activeMembers")}
          value={activeCount}
        />
        {(["admin", "manager"] as UserRole[]).map((r) => (
          <StatCard
            key={r}
            icon={<Building2 className="w-5 h-5 text-amber-400" />}
            label={t(`role_${r}`)}
            value={byRole[r] ?? 0}
          />
        ))}
      </div>

      {/* Members table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("memberList")}
            </span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">
              {t("memberCount", { count: totalCount })}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {typedMembers.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
              {t("noMembers")}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-surface-600)]">
              {typedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[var(--color-surface-700)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
                    {(member.full_name ?? "?").charAt(0).toUpperCase()}
                  </div>

                  {/* Name + department */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {member.full_name ?? "—"}
                    </p>
                    {member.department && (
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {member.department}
                      </p>
                    )}
                  </div>

                  {/* Role badge */}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border capitalize ${
                      ROLE_COLORS[member.role]
                    }`}
                  >
                    {t(`role_${member.role}`)}
                  </span>

                  {/* Active indicator */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      member.is_active ? "bg-green-400" : "bg-[var(--color-surface-600)]"
                    }`}
                    title={member.is_active ? t("statusActive") : t("statusInactive")}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">{icon}</div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
