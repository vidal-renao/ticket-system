import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, Clock, Zap, Shield } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("queue");
  return { title: t("title") };
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function QueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t  = await getTranslations("queue");
  const tp = await getTranslations("priority");
  const ti = await getTranslations("ticket");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles").select("role, organization_id").eq("id", user.id).single();

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    redirect(ticketsPath);
  }

  const orgId = profile.organization_id ?? "00000000-0000-0000-0000-000000000000";

  const { data: ticketsRaw } = await svc
    .from("tickets")
    .select("id, ticket_number, title, status, priority, created_at, sla_breached, sla_resolution_due, contains_pii")
    .eq("organization_id", orgId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  // Fetch ai_analysis separately — embedded join fails silently on FK hint mismatch
  const ticketIds = (ticketsRaw ?? []).map((t: any) => t.id);
  const { data: aiRows } = ticketIds.length
    ? await svc.from("ai_analysis").select("ticket_id, suggested_priority, sentiment, confidence_score, summary").in("ticket_id", ticketIds)
    : { data: [] };

  const aiByTicket = Object.fromEntries((aiRows ?? []).map((a: any) => [a.ticket_id, a]));
  const tickets = (ticketsRaw ?? []).map((t: any) => ({ ...t, ai_analysis: aiByTicket[t.id] ?? null }));

  const sorted = [...tickets].sort((a: any, b: any) => {
    if (a.sla_breached && !b.sla_breached) return -1;
    if (!a.sla_breached && b.sla_breached) return 1;
    return (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3) -
           (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3);
  });

  const critical = sorted.filter((t: any) => t.priority === "critical" || t.sla_breached);
  const regular  = sorted.filter((t: any) => t.priority !== "critical" && !t.sla_breached);

  function TicketRow({ ticket }: { ticket: any }) {
    const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
    return (
      <Link href={ticketPath}>
        <Card hover className="p-4">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0">
              <AlertCircle className={`w-4 h-4 ${
                ticket.priority === "critical" ? "text-red-400" :
                ticket.priority === "high"     ? "text-orange-400" :
                ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">
                  {formatTicketRef(ticket.ticket_number)}
                </span>
                {ticket.contains_pii && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Shield className="w-2.5 h-2.5" /> {ti("piiWarning")}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate mb-1">
                {ticket.title}
              </p>
              {ticket.ai_analysis?.summary && (
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {ticket.ai_analysis.summary}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {ticket.ai_analysis?.sentiment && (
                <span className="text-base" title={ticket.ai_analysis.sentiment}>
                  {sentimentIcon(ticket.ai_analysis.sentiment)}
                </span>
              )}
              {ticket.sla_breached && (
                <Badge className="text-red-400 bg-red-400/10 border-red-400/20">SLA!</Badge>
              )}
              <Badge className={priorityColor(ticket.priority)}>{tp(ticket.priority)}</Badge>
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(ticket.created_at)}
              </span>
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {t("summary", { total: sorted.length, urgent: critical.length })}
          </p>
        </div>
      </div>

      {critical.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
              {t("urgentSla")}
            </h2>
          </div>
          <div className="space-y-2">
            {critical.map((ticket: any) => <TicketRow key={ticket.id} ticket={ticket} />)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {regular.map((ticket: any) => <TicketRow key={ticket.id} ticket={ticket} />)}
      </div>

      {sorted.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("empty")}</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{t("emptyDesc")}</p>
        </Card>
      )}
    </div>
  );
}
