import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import {
  TicketIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  TrendingUp,
  ShieldAlert,
  PlusCircle,
  Users,
} from "lucide-react";
import { formatTicketRef } from "@/lib/utils";
import { AgentAvailabilityToggle } from "@/components/settings/AgentAvailabilityToggle";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id, availability_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect(loginPath);

  const prefix = locale === "de" ? "" : `/${locale}`;

  if (profile.role === "agent") {
    return (
      <AgentDashboard
        userId={user.id}
        availabilityStatus={
          (profile.availability_status as "online" | "offline" | "busy") ??
          "offline"
        }
        prefix={prefix}
      />
    );
  }

  if (profile.role === "customer") {
    return (
      <CustomerDashboard
        userId={user.id}
        locale={locale}
        prefix={prefix}
      />
    );
  }

  if (!["manager", "admin"].includes(profile.role)) {
    redirect(`${prefix}/tickets`);
  }

  return (
    <AdminDashboard
      orgId={profile.organization_id ?? ""}
      prefix={prefix}
    />
  );
}

// ── Admin / Manager Dashboard ────────────────────────────────

async function AdminDashboard({
  orgId,
  prefix,
}: {
  orgId: string;
  prefix: string;
}) {
  const t = await getTranslations("dashboard");
  const svc = createServiceClientStatic();

  if (!orgId) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("noData")}</p>
      </div>
    );
  }

  const [
    { count: totalOpen },
    { count: totalCritical },
    { count: totalResolved },
    { count: slaBreached },
    { data: recentTickets },
    { data: priorityStats },
    { data: teamMembers },
  ] = await Promise.all([
    svc
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress"]),
    svc
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("priority", "critical")
      .in("status", ["open", "in_progress"]),
    svc
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("status", "resolved"),
    svc
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("sla_breached", true),
    svc
      .from("tickets")
      .select("id, ticket_number, title, priority, status, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    svc
      .from("tickets")
      .select("priority")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress"]),
    svc
      .from("profiles")
      .select("full_name, role, availability_status, specialty")
      .eq("organization_id", orgId)
      .in("role", ["agent", "manager"])
      .eq("is_active", true)
      .order("availability_status", { ascending: false })
      .limit(8),
  ]);

  const priorityCounts: Record<string, number> = {};
  for (const row of priorityStats ?? []) {
    const p = row.priority as string;
    priorityCounts[p] = (priorityCounts[p] ?? 0) + 1;
  }
  const topCategories = Object.entries(priorityCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const aiAccuracy = 0;
  const avgConfidence = 0;
  const aiTotal = 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<TicketIcon className="w-5 h-5 text-indigo-400" />}
          label={t("openTickets")}
          value={totalOpen ?? 0}
          href={`${prefix}/queue`}
        />
        <KPICard
          icon={<AlertCircle className="w-5 h-5 text-red-400" />}
          label={t("critical")}
          value={totalCritical ?? 0}
          href={`${prefix}/queue`}
          alert={(totalCritical ?? 0) > 0}
        />
        <KPICard
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          label={t("resolved")}
          value={totalResolved ?? 0}
          href={`${prefix}/tickets`}
        />
        <KPICard
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          label={t("slaBreached")}
          value={slaBreached ?? 0}
          href={`${prefix}/tickets`}
          alert={(slaBreached ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("recentTickets")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentTickets?.map((ticket, i) => {
                const ticketPath = `${prefix}/tickets/${ticket.id}`;
                return (
                  <Link href={ticketPath} key={ticket.id}>
                    <div
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-800)] transition-colors ${
                        i < (recentTickets.length - 1)
                          ? "border-b border-[var(--color-surface-600)]"
                          : ""
                      }`}
                    >
                      <AlertCircle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          ticket.priority === "critical"
                            ? "text-red-400"
                            : ticket.priority === "high"
                            ? "text-orange-400"
                            : ticket.priority === "medium"
                            ? "text-yellow-400"
                            : "text-green-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text-primary)] truncate">
                          {ticket.title}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {formatTicketRef(ticket.ticket_number)}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border capitalize ${
                          ticket.status === "open"
                            ? "text-indigo-400 border-indigo-400/20"
                            : ticket.status === "in_progress"
                            ? "text-blue-400 border-blue-400/20"
                            : "text-slate-400 border-slate-400/20"
                        }`}
                      >
                        {ticket.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {!recentTickets?.length && (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  {t("noData")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team availability */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("teamAvailability")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(teamMembers ?? []).length === 0 && (
                <p className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                  {t("noData")}
                </p>
              )}
              {(teamMembers ?? []).map((member, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-5 py-2.5 ${
                    i < (teamMembers ?? []).length - 1
                      ? "border-b border-[var(--color-surface-700)]"
                      : ""
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      member.availability_status === "online"
                        ? "bg-emerald-400"
                        : member.availability_status === "busy"
                        ? "bg-orange-400"
                        : "bg-slate-500"
                    }`}
                  />
                  <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">
                    {member.full_name ?? "—"}
                  </span>
                  {member.specialty && (
                    <span className="text-xs text-[var(--color-text-muted)] capitalize">
                      {member.specialty}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      member.availability_status === "online"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : member.availability_status === "busy"
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-slate-500/10 text-slate-400"
                    }`}
                  >
                    {member.availability_status ?? "offline"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("aiPerformance")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {t("acceptanceRate")}
                </span>
                <span className="text-sm font-semibold text-green-400">
                  {aiAccuracy}%
                </span>
              </div>
              <ProgressBar value={aiAccuracy} className="bg-green-500" />
              <div className="flex justify-between pt-1">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {t("avgConfidence")}
                </span>
                <span className="text-sm font-semibold text-indigo-400">
                  {avgConfidence}%
                </span>
              </div>
              <ProgressBar value={avgConfidence} className="bg-indigo-500" />
              <p className="text-[10px] text-[var(--color-text-muted)] pt-1">
                {t("aiBasedOn", { count: aiTotal })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("byCategory")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {topCategories.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("noData")}
                </p>
              )}
              {topCategories.map(([name, count]) => {
                const max = topCategories[0]?.[1] ?? 1;
                const COLORS: Record<string, string> = {
                  critical: "bg-red-500",
                  high: "bg-orange-500",
                  medium: "bg-yellow-500",
                  low: "bg-green-500",
                };
                return (
                  <div key={name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[var(--color-text-secondary)] capitalize">
                        {name}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {count}
                      </span>
                    </div>
                    <ProgressBar
                      value={(count / max) * 100}
                      className={COLORS[name] ?? "bg-indigo-500/60"}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Agent Dashboard ──────────────────────────────────────────

async function AgentDashboard({
  userId,
  availabilityStatus,
  prefix,
}: {
  userId: string;
  availabilityStatus: "online" | "offline" | "busy";
  prefix: string;
}) {
  const t = await getTranslations("agentDashboard");
  const svc = createServiceClientStatic();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: assignedTickets }, { count: resolvedToday }] =
    await Promise.all([
      svc
        .from("tickets")
        .select(
          "id, ticket_number, title, priority, status, sla_resolution_due, sla_breached, created_at"
        )
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .in("status", [
          "open",
          "in_progress",
          "pending_customer",
          "pending_third_party",
        ])
        .order("sla_resolution_due", { ascending: true, nullsFirst: false })
        .limit(10),
      svc
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .eq("status", "resolved")
        .gte("resolved_at", todayStart.toISOString()),
    ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <KPICard
          icon={<TicketIcon className="w-5 h-5 text-indigo-400" />}
          label={t("assignedOpen")}
          value={assignedTickets?.length ?? 0}
          href={`${prefix}/queue`}
          alert={(assignedTickets?.filter((t) => t.sla_breached).length ?? 0) > 0}
        />
        <KPICard
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          label={t("resolvedToday")}
          value={resolvedToday ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("assignedTickets")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(assignedTickets ?? []).length === 0 && (
                <div className="px-5 py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {t("noAssignedTickets")}
                  </p>
                </div>
              )}
              {(assignedTickets ?? []).map((ticket, i) => {
                const timeLeft = formatTimeRemaining(ticket.sla_resolution_due);
                const breached = ticket.sla_breached;
                const ticketPath = `${prefix}/tickets/${ticket.id}`;

                return (
                  <Link href={ticketPath} key={ticket.id}>
                    <div
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-800)] transition-colors ${
                        i < (assignedTickets ?? []).length - 1
                          ? "border-b border-[var(--color-surface-600)]"
                          : ""
                      }`}
                    >
                      <AlertCircle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          ticket.priority === "critical"
                            ? "text-red-400"
                            : ticket.priority === "high"
                            ? "text-orange-400"
                            : ticket.priority === "medium"
                            ? "text-yellow-400"
                            : "text-green-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text-primary)] truncate">
                          {ticket.title}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {formatTicketRef(ticket.ticket_number)}
                        </p>
                      </div>
                      {timeLeft && (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums ${
                            breached
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-[var(--color-surface-700)] text-[var(--color-text-muted)]"
                          }`}
                        >
                          {breached ? t("slaBreached") : timeLeft}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("availability")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <AgentAvailabilityToggle
                userId={userId}
                initial={availabilityStatus}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Customer Dashboard ───────────────────────────────────────

async function CustomerDashboard({
  userId,
  locale,
  prefix,
}: {
  userId: string;
  locale: string;
  prefix: string;
}) {
  const t = await getTranslations("customerDashboard");
  const svc = createServiceClientStatic();

  const [{ count: openCount }, { count: resolvedCount }, { data: recentTickets }] =
    await Promise.all([
      svc
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null)
        .in("status", ["open", "in_progress", "pending_customer", "pending_third_party"]),
      svc
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .is("deleted_at", null)
        .eq("status", "resolved"),
      svc
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at")
        .eq("created_by", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <Link href={`${prefix}/tickets/new`} className="block mb-6">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/30 bg-indigo-600/10 hover:bg-indigo-600/15 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-300">{t("newRequest")}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {t("newRequestHint")}
            </p>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <KPICard
          icon={<TicketIcon className="w-5 h-5 text-indigo-400" />}
          label={t("openTickets")}
          value={openCount ?? 0}
          href={`${prefix}/tickets`}
          alert={(openCount ?? 0) > 0}
        />
        <KPICard
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          label={t("resolvedTickets")}
          value={resolvedCount ?? 0}
          href={`${prefix}/tickets`}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("recentTickets")}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(recentTickets ?? []).length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">{t("noTickets")}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{t("noTicketsHint")}</p>
            </div>
          )}
          {(recentTickets ?? []).map((ticket, i) => {
            const ticketPath = `${prefix}/tickets/${ticket.id}`;
            const updatedAt = new Date(ticket.created_at).toLocaleDateString(
              locale === "de" ? "de-CH" : locale === "es" ? "es-ES" : "en-GB"
            );
            return (
              <Link href={ticketPath} key={ticket.id}>
                <div
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-800)] transition-colors ${
                    i < (recentTickets ?? []).length - 1
                      ? "border-b border-[var(--color-surface-600)]"
                      : ""
                  }`}
                >
                  <AlertCircle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      ticket.priority === "critical"
                        ? "text-red-400"
                        : ticket.priority === "high"
                        ? "text-orange-400"
                        : ticket.priority === "medium"
                        ? "text-yellow-400"
                        : "text-green-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] truncate">
                      {ticket.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatTicketRef(ticket.ticket_number)} · {t("lastUpdate")}: {updatedAt}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border capitalize ${
                      ticket.status === "open"
                        ? "text-indigo-400 border-indigo-400/20"
                        : ticket.status === "resolved"
                        ? "text-green-400 border-green-400/20"
                        : "text-blue-400 border-blue-400/20"
                    }`}
                  >
                    {ticket.status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────

function KPICard({
  icon,
  label,
  value,
  alert,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  alert?: boolean;
  href?: string;
}) {
  const inner = (
    <Card
      className={`${alert ? "border-red-500/30" : ""}${
        href ? " hover:border-[var(--color-surface-500)] transition-colors cursor-pointer" : ""
      }`}
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">
          {icon}
          {alert && (
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
          {value}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
      <div
        className={`h-full rounded-full ${className ?? ""}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function formatTimeRemaining(deadline: string | null): string {
  if (!deadline) return "";
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "BREACHED";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
