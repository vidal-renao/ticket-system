import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import {
  TicketIcon, AlertCircle, CheckCircle2, Clock,
  Zap, TrendingUp, Users, ShieldAlert,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["manager", "admin"].includes(profile.role)) {
    redirect("/queue");
  }

  const orgId = profile.organization_id ?? "";

  // Parallel data fetching
  const [
    { count: totalOpen },
    { count: totalCritical },
    { count: totalResolved },
    { count: slaBreached },
    { data: recentTickets },
    { data: categoryStats },
    { data: aiStats },
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
      .select("id, ticket_number, title, priority, status, created_at, categories(name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("tickets")
      .select("categories(name, slug)")
      .eq("organization_id", orgId)
      .not("category_id", "is", null),
    supabase.from("ai_analysis")
      .select("confidence_score, category_accepted, priority_accepted")
      .limit(100),
  ]);

  // Category breakdown
  const catCount: Record<string, number> = {};
  categoryStats?.forEach((t: any) => {
    const name = t.categories?.name ?? "Other";
    catCount[name] = (catCount[name] ?? 0) + 1;
  });
  const topCategories = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // AI accuracy
  const aiTotal = aiStats?.length ?? 0;
  const aiAccepted = aiStats?.filter((a: any) => a.category_accepted !== false).length ?? 0;
  const aiAccuracy = aiTotal > 0 ? Math.round((aiAccepted / aiTotal) * 100) : 0;
  const avgConfidence = aiTotal > 0
    ? Math.round((aiStats?.reduce((s: number, a: any) => s + (a.confidence_score ?? 0), 0) ?? 0) / aiTotal)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Executive Dashboard</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Real-time operations overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<TicketIcon className="w-5 h-5 text-indigo-400" />}
          label="Open Tickets"
          value={totalOpen ?? 0}
          color="indigo"
        />
        <KPICard
          icon={<AlertCircle className="w-5 h-5 text-red-400" />}
          label="Critical"
          value={totalCritical ?? 0}
          color="red"
          alert={(totalCritical ?? 0) > 0}
        />
        <KPICard
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          label="Resolved"
          value={totalResolved ?? 0}
          color="green"
        />
        <KPICard
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          label="SLA Breached"
          value={slaBreached ?? 0}
          color="amber"
          alert={(slaBreached ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Tickets */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">Recent Tickets</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentTickets?.map((t: any, i: number) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    i < (recentTickets.length - 1) ? "border-b border-[var(--color-surface-600)]" : ""
                  }`}
                >
                  <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${
                    t.priority === "critical" ? "text-red-400" :
                    t.priority === "high"     ? "text-orange-400" :
                    t.priority === "medium"   ? "text-yellow-400" : "text-green-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] truncate">{t.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      TK-{String(t.ticket_number).padStart(4, "0")} · {t.categories?.name ?? "Uncategorized"}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border capitalize ${
                    t.status === "open" ? "text-indigo-400 border-indigo-400/20" :
                    t.status === "in_progress" ? "text-blue-400 border-blue-400/20" : "text-slate-400 border-slate-400/20"
                  }`}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
              {!recentTickets?.length && (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No tickets yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI Performance */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">AI Performance</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">Acceptance rate</span>
                <span className="text-sm font-semibold text-green-400">{aiAccuracy}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                <ProgressBar value={aiAccuracy} className="bg-green-500" />
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-xs text-[var(--color-text-muted)]">Avg confidence</span>
                <span className="text-sm font-semibold text-indigo-400">{avgConfidence}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                <ProgressBar value={avgConfidence} className="bg-indigo-500" />
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)] pt-1">
                Based on {aiTotal} analyzed tickets
              </p>
            </CardContent>
          </Card>

          {/* Category breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">By Category</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {topCategories.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">No data yet</p>
              )}
              {topCategories.map(([name, count]) => {
                const max = topCategories[0][1];
                return (
                  <div key={name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[var(--color-text-secondary)]">{name}</span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">{count}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-[var(--color-surface-700)]">
                      <ProgressBar value={(count / max) * 100} className="bg-indigo-500/60" />
                    </div>
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

function KPICard({
  icon, label, value, color, alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-red-500/30" : ""}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">
          {icon}
          {alert && (
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
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
    <div
      className={`h-full rounded-full transition-all [width:var(--bar-w)] ${className ?? ""}`}
      style={{ "--bar-w": `${clamped}%` } as React.CSSProperties}
    />
  );
}
