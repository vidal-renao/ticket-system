import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Users, UserCheck, Building2, Wrench } from "lucide-react";
import type { UserRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("team");
  return { title: t("title") };
}

const ROLE_BADGE: Record<UserRole, { label: string; cls: string }> = {
  admin:    { label: "Admin",    cls: "text-red-400    bg-red-500/10    border-red-500/20" },
  manager:  { label: "Manager",  cls: "text-amber-400  bg-amber-500/10  border-amber-500/20" },
  agent:    { label: "Employee", cls: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  customer: { label: "Company",  cls: "text-slate-400  bg-slate-500/10  border-slate-500/20" },
};

interface MemberRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
  specialty: string | null;
  team_id: string | null;
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

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) {
    redirect(queuePath);
  }

  if (!profile.organization_id) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("noMembers")}</p>
      </div>
    );
  }

  const orgId = profile.organization_id;

  // Fetch members with specialty + team_id (safely — may not exist pre-migration)
  const { data: membersRaw } = await svc
    .from("profiles")
    .select("id, full_name, role, department, is_active, created_at")
    .eq("organization_id", orgId)
    .order("role")
    .order("full_name");

  // Fetch specialty/team_id separately
  const { data: extrasRaw } = await svc
    .from("profiles")
    .select("id, specialty, team_id")
    .eq("organization_id", orgId);

  const extrasMap = Object.fromEntries(
    ((extrasRaw ?? []) as { id: string; specialty: string | null; team_id: string | null }[]).map(
      (e) => [e.id, { specialty: e.specialty, team_id: e.team_id }]
    )
  );

  const members: MemberRow[] = ((membersRaw ?? []) as Omit<MemberRow, "specialty" | "team_id">[]).map(
    (m) => ({
      ...m,
      specialty: extrasMap[m.id]?.specialty ?? null,
      team_id:   extrasMap[m.id]?.team_id ?? null,
    })
  );

  // Fetch teams map
  const { data: teamsRaw } = await svc
    .from("teams")
    .select("id, name")
    .eq("organization_id", orgId);
  const teamsMap = Object.fromEntries(
    ((teamsRaw ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  // Fetch company names for customers
  const customerIds = members.filter((m) => m.role === "customer").map((m) => m.id);
  const { data: customerInfoRaw } = customerIds.length
    ? await svc.from("customers_info").select("id, company_name, industry").in("id", customerIds)
    : { data: [] as { id: string; company_name: string; industry: string }[] };
  const companyMap = Object.fromEntries(
    ((customerInfoRaw ?? []) as { id: string; company_name: string; industry: string }[]).map(
      (c) => [c.id, { name: c.company_name, industry: c.industry }]
    )
  );

  // Stats
  const agents    = members.filter((m) => m.role === "agent" || m.role === "manager");
  const customers = members.filter((m) => m.role === "customer");
  const active    = members.filter((m) => m.is_active);

  const specialtyCount = agents.reduce<Record<string, number>>((acc, m) => {
    if (m.specialty) acc[m.specialty] = (acc[m.specialty] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users className="w-5 h-5 text-indigo-400" />}      label="Total Members"   value={members.length} />
        <StatCard icon={<UserCheck className="w-5 h-5 text-green-400" />}   label="Active"          value={active.length} />
        <StatCard icon={<Wrench className="w-5 h-5 text-violet-400" />}     label="Employees"       value={agents.length} />
        <StatCard icon={<Building2 className="w-5 h-5 text-amber-400" />}   label="Companies"       value={customers.length} />
      </div>

      {/* Specialty distribution */}
      {Object.keys(specialtyCount).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(specialtyCount).map(([spec, count]) => (
            <span
              key={spec}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-secondary)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              {spec}
              <span className="text-[var(--color-text-muted)]">· {count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Employees section */}
      {agents.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-violet-400" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">Employees</span>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">{agents.length} members</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--color-surface-600)]">
              {agents.map((member) => {
                const teamName = member.team_id ? (teamsMap[member.team_id] ?? null) : null;
                return (
                  <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
                      {(member.full_name ?? "?").charAt(0).toUpperCase()}
                    </div>

                    {/* Name + team */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {member.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {teamName ? `Team: ${teamName}` : member.department ?? "—"}
                      </p>
                    </div>

                    {/* Specialty */}
                    {member.specialty && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                        {member.specialty}
                      </span>
                    )}

                    {/* Role badge */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border capitalize shrink-0 ${ROLE_BADGE[member.role].cls}`}>
                      {ROLE_BADGE[member.role].label}
                    </span>

                    {/* Active dot */}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${member.is_active ? "bg-green-400" : "bg-[var(--color-surface-600)]"}`}
                      title={member.is_active ? "Active" : "Inactive"}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Companies section */}
      {customers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">Companies</span>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">{customers.length} accounts</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--color-surface-600)]">
              {customers.map((member) => {
                const company = companyMap[member.id];
                return (
                  <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-amber-600/20 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                      {(company?.name ?? member.full_name ?? "?").charAt(0).toUpperCase()}
                    </div>

                    {/* Company name + contact */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {company?.name ?? member.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {company?.industry ? `${company.industry} · ` : ""}
                        {member.full_name && company?.name ? member.full_name : ""}
                      </p>
                    </div>

                    {/* Industry badge */}
                    {company?.industry && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 hidden sm:block">
                        {company.industry}
                      </span>
                    )}

                    {/* Role badge */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border capitalize shrink-0 ${ROLE_BADGE.customer.cls}`}>
                      {ROLE_BADGE.customer.label}
                    </span>

                    {/* Active dot */}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${member.is_active ? "bg-green-400" : "bg-[var(--color-surface-600)]"}`}
                      title={member.is_active ? "Active" : "Inactive"}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {members.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("noMembers")}</p>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">{icon}</div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] tabular-nums">{value}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
