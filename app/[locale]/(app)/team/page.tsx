import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { Users, Building2, Wrench, Wifi, ChevronRight } from "lucide-react";
import type { UserRole } from "@/lib/supabase/types";
import { effectivePresence, formatLastSeen, type EffectivePresence } from "@/lib/presence";
import { getLastSeenMap } from "@/lib/presence-server";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

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

const PRESENCE_BADGE: Record<EffectivePresence, string> = {
  online:  "bg-emerald-500/10 text-emerald-400",
  busy:    "bg-orange-500/10 text-orange-400",
  offline: "bg-slate-500/10 text-slate-400",
};

interface MemberRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
  availability_status: "online" | "offline" | "busy" | null;
  specialty: string | null;
  team_id: string | null;
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ presence?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const t = await getTranslations("team");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("hd_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) {
    redirect(queuePath);
  }

  if (!profile.organization_id) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("noMembers")}</p>
      </div>
    );
  }

  const orgId = profile.organization_id;
  const teamBase = locale === "de" ? "/team" : `/${locale}/team`;
  const onlineOnly = filters.presence === "online";

  const { data: membersRaw } = await svc
    .from("hd_profiles")
    .select("id, full_name, role, department, is_active, created_at, availability_status")
    .eq("organization_id", orgId)
    .in("role", ["agent", "manager", "admin", "customer"])
    .order("role")
    .order("full_name");

  // Specialty/team_id and last_seen_at are fetched separately so environments
  // missing the newer columns keep working.
  const { data: extrasRaw } = await svc
    .from("hd_profiles")
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

  const staff     = members.filter((m) => m.role === "agent" || m.role === "manager" || m.role === "admin");
  const customers = members.filter((m) => m.role === "customer");

  const [lastSeenMap, { data: activeTicketRows }, { data: teamsRaw }] = await Promise.all([
    getLastSeenMap(svc, staff.map((m) => m.id)),
    staff.length
      ? svc
          .from("hd_tickets")
          .select("assigned_to")
          .eq("organization_id", orgId)
          .in("assigned_to", staff.map((m) => m.id))
          .in("status", ACTIVE_TICKET_STATUSES)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { assigned_to: string | null }[] }),
    svc.from("teams").select("id, name").eq("organization_id", orgId),
  ]);

  const workload: Record<string, number> = {};
  for (const row of (activeTicketRows ?? []) as { assigned_to: string | null }[]) {
    if (row.assigned_to) workload[row.assigned_to] = (workload[row.assigned_to] ?? 0) + 1;
  }

  const teamsMap = Object.fromEntries(
    ((teamsRaw ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  const staffWithPresence = staff
    .map((member) => ({
      ...member,
      presence: effectivePresence(member.availability_status, lastSeenMap[member.id]),
      lastSeen: lastSeenMap[member.id] ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.presence !== "offline") - Number(a.presence !== "offline") ||
        (a.full_name ?? "").localeCompare(b.full_name ?? "")
    );

  const onlineStaff = staffWithPresence.filter((m) => m.presence !== "offline");
  const visibleStaff = onlineOnly ? onlineStaff : staffWithPresence;

  // Company names for customers
  const customerIds = customers.map((m) => m.id);
  const { data: customerInfoRaw } = customerIds.length
    ? await svc.from("hd_customers_info").select("id, company_name, industry").in("id", customerIds)
    : { data: [] as { id: string; company_name: string; industry: string }[] };
  const companyMap = Object.fromEntries(
    ((customerInfoRaw ?? []) as { id: string; company_name: string; industry: string }[]).map(
      (c) => [c.id, { name: c.company_name, industry: c.industry }]
    )
  );

  const specialtyCount = staff.reduce<Record<string, number>>((acc, m) => {
    if (m.specialty) acc[m.specialty] = (acc[m.specialty] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={<Users className="w-5 h-5 text-indigo-400" />}    label="Total Members" value={members.length} />
        <StatCard icon={<Wifi className="w-5 h-5 text-emerald-400" />}    label="Online now"    value={onlineStaff.length} href={`${teamBase}?presence=online`} active={onlineOnly} />
        <StatCard icon={<Wrench className="w-5 h-5 text-violet-400" />}   label="Employees"     value={staff.length} />
        <StatCard icon={<Building2 className="w-5 h-5 text-amber-400" />} label="Companies"     value={customers.length} />
      </div>

      {/* Online filter notice */}
      {onlineOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <p className="text-sm text-emerald-300">
            Showing only members connected right now ({onlineStaff.length}).
          </p>
          <Link href={teamBase} className="ml-auto text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-text-secondary)]">
            Show everyone
          </Link>
        </div>
      )}

      {/* Specialty distribution */}
      {Object.keys(specialtyCount).length > 0 && !onlineOnly && (
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
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-violet-400" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Employees</span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">
              {visibleStaff.length} {onlineOnly ? "online" : "members"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleStaff.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
              {onlineOnly ? "Nobody is connected right now." : t("noMembers")}
            </p>
          )}
          <div className="divide-y divide-[var(--color-surface-600)]">
            {visibleStaff.map((member) => {
              const teamName = member.team_id ? (teamsMap[member.team_id] ?? null) : null;
              return (
                <Link
                  key={member.id}
                  href={`${teamBase}/${member.id}`}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-800)]"
                >
                  <PresenceAvatar
                    name={member.full_name?.trim() || "—"}
                    status={member.presence}
                    queueCount={workload[member.id] ?? 0}
                    size="sm"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {member.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {teamName ? `Team: ${teamName}` : member.department ?? "—"}
                      {member.presence === "offline" && ` · ${formatLastSeen(member.lastSeen)}`}
                    </p>
                  </div>

                  {member.specialty && (
                    <span className="hidden sm:block text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                      {member.specialty}
                    </span>
                  )}

                  <span className={`hidden sm:block text-[11px] font-semibold px-2 py-0.5 rounded border capitalize shrink-0 ${ROLE_BADGE[member.role].cls}`}>
                    {ROLE_BADGE[member.role].label}
                  </span>

                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRESENCE_BADGE[member.presence]}`}>
                    {member.presence}
                  </span>

                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Companies section */}
      {customers.length > 0 && !onlineOnly && (
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
                  <div key={member.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-amber-600/20 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                      {(company?.name ?? member.full_name ?? "?").charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {company?.name ?? member.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {company?.industry ? `${company.industry} · ` : ""}
                        {member.full_name && company?.name ? member.full_name : ""}
                      </p>
                    </div>

                    {company?.industry && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 hidden sm:block">
                        {company.industry}
                      </span>
                    )}

                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border capitalize shrink-0 ${ROLE_BADGE.customer.cls}`}>
                      {ROLE_BADGE.customer.label}
                    </span>

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
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href?: string;
  active?: boolean;
}) {
  const inner = (
    <Card className={`h-full ${active ? "border-emerald-500/40" : ""} ${href ? "transition-colors hover:border-[var(--color-surface-500)]" : ""}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">{icon}</div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] tabular-nums">{value}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
