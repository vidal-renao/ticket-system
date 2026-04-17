import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { BarChart3, Zap, AlertCircle, ShieldAlert, Clock } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon } from "@/lib/utils";
import type { SentimentType, TicketPriority } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("analytics");
  return { title: t("title") };
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t  = await getTranslations("analytics");
  const tp = await getTranslations("priority");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const { data: profile } = await supabase
    .from("profiles").select("role, organization_id").eq("id", user.id).single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!profile || !["manager", "admin"].includes(profile.role)) redirect(queuePath);

  const orgId = profile.organization_id ?? "";

  // SLA breach risk threshold: 4 hours from now
  const slaRiskThreshold = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const [
    { data: ticketsWithAI },
    { data: slaAtRisk },
    { data: openByPriority },
  ] = await Promise.all([
    supabase.from("tickets")
      .select("priority, status, ai_analysis(sentiment, confidence_score, category_accepted, contains_pii_detected)")
      .eq("organization_id", orgId),
    supabase.from("tickets")
      .select("id, ticket_number, title, priority, sla_resolution_due, categories(name)")
      .eq("organization_id", orgId)
      .in("status", ["open", "in_progress"])
      .not("sla_resolution_due", "is", null)
      .lte("sla_resolution_due", slaRiskThreshold)
      .eq("sla_breached", false)
      .order("sla_resolution_due", { ascending: true })
      .limit(10),
    supabase.from("tickets")
      .select("priority")
      .eq("organization_id", orgId)
      .in("status", ["open", "in_progress"]),
  ]);

  // Compute sentiment distribution
  const sentimentCounts: Record<SentimentType, number> = {
    calm: 0, neutral: 0, frustrated: 0, urgent: 0, angry: 0,
  };
  let totalAI = 0, totalPIIDetected = 0;
  let totalConfidence = 0, confidenceCount = 0;
  let categoryAccepted = 0, feedbackTotal = 0;

  for (const row of ticketsWithAI ?? []) {
    const ai = (row as any).ai_analysis;
    if (!ai) continue;
    totalAI++;
    if (ai.sentiment && ai.sentiment in sentimentCounts) {
      sentimentCounts[ai.sentiment as SentimentType]++;
    }
    if (ai.confidence_score != null) {
      totalConfidence += ai.confidence_score;
      confidenceCount++;
    }
    if (ai.contains_pii_detected) totalPIIDetected++;
    if (ai.category_accepted !== null && ai.category_accepted !== undefined) {
      feedbackTotal++;
      if (ai.category_accepted) categoryAccepted++;
    }
  }

  const avgConfidence   = confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0;
  const catAccuracyRate = feedbackTotal   > 0 ? Math.round((categoryAccepted / feedbackTotal) * 100) : 0;
  const maxSentiment    = Math.max(...Object.values(sentimentCounts), 1);

  // Priority distribution
  const priorityCounts: Record<TicketPriority, number> = {
    critical: 0, high: 0, medium: 0, low: 0,
  };
  for (const row of openByPriority ?? []) {
    const p = (row as any).priority as TicketPriority;
    if (p in priorityCounts) priorityCounts[p]++;
  }
  const totalOpen = Object.values(priorityCounts).reduce((a, b) => a + b, 0);

  const SENTIMENT_COLORS: Record<SentimentType, string> = {
    angry:      "bg-red-500",
    frustrated: "bg-orange-500",
    urgent:     "bg-amber-500",
    neutral:    "bg-blue-500",
    calm:       "bg-green-500",
  };

  const PRIORITY_COLORS: Record<TicketPriority, string> = {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-yellow-500",
    low:      "bg-green-500",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<Zap className="w-5 h-5 text-indigo-400" />}
          label={t("aiAnalyzed")}
          value={totalAI}
        />
        <KPICard
          icon={<BarChart3 className="w-5 h-5 text-green-400" />}
          label={t("avgConfidence")}
          value={`${avgConfidence}%`}
        />
        <KPICard
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          label={t("piiDetected")}
          value={totalPIIDetected}
          alert={totalPIIDetected > 0}
        />
        <KPICard
          icon={<AlertCircle className="w-5 h-5 text-red-400" />}
          label={t("slaAtRisk")}
          value={slaAtRisk?.length ?? 0}
          alert={(slaAtRisk?.length ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Sentiment Distribution */}
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("sentimentTitle")}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {totalAI === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">{t("noData")}</p>
            ) : (
              (["angry", "frustrated", "urgent", "neutral", "calm"] as SentimentType[]).map((s) => (
                <div key={s}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {sentimentIcon(s)}{" "}
                      {t(`sentiment.${s}` as Parameters<typeof t>[0])}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      {sentimentCounts[s]}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                    <div
                      className={`h-full rounded-full ${SENTIMENT_COLORS[s]}`}
                      style={{ width: `${(sentimentCounts[s] / maxSentiment) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("priorityDistribution")}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {totalOpen === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">{t("noData")}</p>
            ) : (
              (["critical", "high", "medium", "low"] as TicketPriority[]).map((p) => {
                const count = priorityCounts[p];
                const pct   = totalOpen > 0 ? Math.round((count / totalOpen) * 100) : 0;
                return (
                  <div key={p}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[var(--color-text-secondary)] capitalize">
                        {tp(p)}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {count}{" "}
                        <span className="text-[var(--color-text-muted)]">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                      <div
                        className={`h-full rounded-full ${PRIORITY_COLORS[p]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* SLA Breach Prediction */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                {t("slaBreachPrediction")}
              </span>
              {(slaAtRisk?.length ?? 0) > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {slaAtRisk && slaAtRisk.length > 0 ? (
              slaAtRisk.map((ticket: any, i: number) => {
                const ticketPath   = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                const minutesLeft  = Math.round(
                  (new Date(ticket.sla_resolution_due).getTime() - Date.now()) / 60_000
                );
                const timeLabel    = minutesLeft < 60
                  ? `${minutesLeft}m`
                  : `${Math.round(minutesLeft / 60)}h`;
                const timeColor    = minutesLeft < 60 ? "text-red-400" : "text-orange-400";

                return (
                  <Link href={ticketPath} key={ticket.id}>
                    <div
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-800)] transition-colors ${
                        i < slaAtRisk.length - 1 ? "border-b border-[var(--color-surface-600)]" : ""
                      }`}
                    >
                      <AlertCircle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          ticket.priority === "critical" ? "text-red-400"    :
                          ticket.priority === "high"     ? "text-orange-400" :
                          ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text-primary)] truncate">
                          {ticket.title}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {formatTicketRef(ticket.ticket_number)} · {(ticket as any).categories?.name ?? "—"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-semibold ${timeColor}`}>{timeLabel}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{t("remaining")}</p>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
                {t("noSlaRisk")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Accuracy */}
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("aiAccuracy")}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs text-[var(--color-text-muted)]">{t("categoryAcceptance")}</span>
                <span className="text-sm font-semibold text-green-400">{catAccuracyRate}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${catAccuracyRate}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs text-[var(--color-text-muted)]">{t("avgConfidence")}</span>
                <span className="text-sm font-semibold text-indigo-400">{avgConfidence}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-700)]">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${avgConfidence}%` }} />
              </div>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {t("basedOn", { count: totalAI })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  icon, label, value, alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  alert?: boolean;
}) {
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
