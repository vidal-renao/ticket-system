import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { TicketIcon, AlertCircle, CheckCircle2, Clock, Zap, TrendingUp, ShieldAlert } from "lucide-react";

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
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const { data: profile } = await supabase
    .from("profiles").select("role, organization_id").eq("id", user.id).single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) redirect(queuePath);

  if (!profile.organization_id) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("noData")}</p>
      </div>
    );
  }

  const orgId = profile.organization_id;

  // All queries are flat — no embedded joins (categories/ai_analysis RLS
  // can reject the whole PostgREST request if the policy blocks reads)
  const [
    { count: totalOpen },
    { count: totalCritical },
    { count: totalResolved },
    { count: slaBreached },
    { data: recentTickets },
    { data: priorityStats },
  ] = await Promise.all([
    supabase.from("tickets").select("*", { count: "exact", head: true })
      .eq("organization_id", orgId).in("status", ["open", "in_progress"]),
    supabase.from("tickets").select("*", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("priority", "critical").in("status", ["open", "in_progress"]),
    supabase.from("tickets").select("*", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("status", "resolved"),
    supabase.from("tickets").select("*", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("sla_breached", true),
    supabase.from("tickets")
      .select("id, ticket_number, title, priority, status, created_at")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
    supabase.from("tickets")
      .select("priority").eq("organization_id", orgId).in("status", ["open", "in_progress"]),
  ]);

  const priorityCounts: Record<string, number> = {};
  for (const row of priorityStats ?? []) {
    const p = (row as any).priority as string;
    priorityCounts[p] = (priorityCounts[p] ?? 0) + 1;
  }
  const topCategories: [string, number][] = Object.entries(priorityCounts)
    .sort((a, b) => b[1] - a[1]);

  // AI stats removed from Promise.all (ai_analysis RLS scoping requires ticket IDs)
  // Shown as 0 until analytics page is used — which queries correctly
  const aiAccuracy = 0;
  const avgConfidence = 0;
  const aiTotal = 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={<TicketIcon className="w-5 h-5 text-indigo-400" />} label={t("openTickets")} value={totalOpen ?? 0} />
        <KPICard icon={<AlertCircle className="w-5 h-5 text-red-400" />}   label={t("critical")}    value={totalCritical ?? 0} alert={(totalCritical ?? 0) > 0} />
        <KPICard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label={t("resolved")}   value={totalResolved ?? 0} />
        <KPICard icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}  label={t("slaBreached")} value={slaBreached ?? 0} alert={(slaBreached ?? 0) > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("recentTickets")}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentTickets?.map((ticket: any, i: number) => {
                const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                return (
                  <Link href={ticketPath} key={ticket.id}>
                    <div className={`flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-800)] transition-colors ${i < (recentTickets.length - 1) ? "border-b border-[var(--color-surface-600)]" : ""}`}>
                      <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${
                        ticket.priority === "critical" ? "text-red-400" :
                        ticket.priority === "high"     ? "text-orange-400" :
                        ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text-primary)] truncate">{ticket.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          TK-{String(ticket.ticket_number).padStart(4, "0")}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize ${
                        ticket.status === "open" ? "text-indigo-400 border-indigo-400/20" :
                        ticket.status === "in_progress" ? "text-blue-400 border-blue-400/20" : "text-slate-400 border-slate-400/20"
                      }`}>
                        {ticket.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {!recentTickets?.length && (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">{t("noData")}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("aiPerformance")}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">{t("acceptanceRate")}</span>
                <span className="text-sm font-semibold text-green-400">{aiAccuracy}%</span>
              </div>
              <ProgressBar value={aiAccuracy} className="bg-green-500" />
              <div className="flex justify-between pt-1">
                <span className="text-xs text-[var(--color-text-muted)]">{t("avgConfidence")}</span>
                <span className="text-sm font-semibold text-indigo-400">{avgConfidence}%</span>
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
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("byCategory")}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {topCategories.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">{t("noData")}</p>}
              {topCategories.map(([name, count]) => {
                const max = topCategories[0]?.[1] ?? 1;
                const COLORS: Record<string, string> = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-green-500" };
                return (
                  <div key={name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[var(--color-text-secondary)] capitalize">{name}</span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{count}</span>
                    </div>
                    <ProgressBar value={(count / max) * 100} className={COLORS[name] ?? "bg-indigo-500/60"} />
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

function KPICard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) {
  return (
    <Card className={alert ? "border-red-500/30" : ""}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">
          {icon}
          {alert && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
        </div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
      <div className={`h-full rounded-full ${className ?? ""}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
