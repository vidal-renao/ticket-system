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
    .from("profiles")
    .select("role, organization_id, team_id")
    .eq("id", user.id)
    .single();

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    redirect(ticketsPath);
  }

  const orgId = profile.organization_id ?? "00000000-0000-0000-0000-000000000000";

  const { data: ticketsRaw } = await svc
    .from("tickets")
    .select(
      "id, ticket_number, title, status, priority, created_at, sla_breached, sla_resolution_due, contains_pii, category, assigned_team_id, assigned_to"
    )
    .eq("organization_id", orgId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  type RawTicket = { id: string; ticket_number: number; title: string; status: string; priority: string; created_at: string; sla_breached?: boolean; contains_pii?: boolean; category?: string; assigned_team_id?: string; assigned_to?: string };
  type AiRow = { ticket_id: string; suggested_priority?: string; sentiment?: string; confidence_score?: number; summary?: string };

  const ticketIds = (ticketsRaw ?? []).map((t: RawTicket) => t.id);
  const { data: aiRows } = ticketIds.length
    ? await svc
        .from("ai_analysis")
        .select("ticket_id, suggested_priority, sentiment, confidence_score, summary")
        .in("ticket_id", ticketIds)
    : { data: [] as AiRow[] };

  const aiByTicket = Object.fromEntries(
    (aiRows ?? []).map((a: AiRow) => [a.ticket_id, a])
  );
  const tickets = (ticketsRaw ?? []).map((t: RawTicket) => ({
    ...t,
    ai_analysis: aiByTicket[t.id] ?? null,
  }));

  type TicketRow = {
    id: string;
    ticket_number: number;
    title: string;
    status: string;
    priority: string;
    created_at: string;
    sla_breached?: boolean;
    contains_pii?: boolean;
    category?: string;
    assigned_team_id?: string;
    assigned_to?: string;
    ai_analysis: { sentiment?: string; summary?: string; ticket_id?: string } | null;
  };

  // Sort: SLA breached → agent's own team → priority
  const agentTeamId = profile.team_id ?? null;
  const sorted = (tickets as TicketRow[]).sort((a, b) => {
    if (a.sla_breached && !b.sla_breached) return -1;
    if (!a.sla_breached && b.sla_breached) return 1;
    if (agentTeamId) {
      const aMyTeam = a.assigned_team_id === agentTeamId;
      const bMyTeam = b.assigned_team_id === agentTeamId;
      if (aMyTeam && !bMyTeam) return -1;
      if (!aMyTeam && bMyTeam) return 1;
    }
    return (
      (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3) -
      (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3)
    );
  });

  const critical = sorted.filter((t) => t.priority === "critical" || t.sla_breached);
  const myTeam   = sorted.filter(
    (t) => !t.sla_breached && t.priority !== "critical" && !!agentTeamId && t.assigned_team_id === agentTeamId
  );
  const others   = sorted.filter(
    (t) => !t.sla_breached && t.priority !== "critical" && (!agentTeamId || t.assigned_team_id !== agentTeamId)
  );

  function TicketRow({ ticket }: { ticket: TicketRow }) {
    const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
    return (
      <Link href={ticketPath}>
        <Card hover className="p-4">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0">
              <AlertCircle
                className={`w-4 h-4 ${
                  ticket.priority === "critical" ? "text-red-400" :
                  ticket.priority === "high"     ? "text-orange-400" :
                  ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">
                  {formatTicketRef(ticket.ticket_number)}
                </span>
                {ticket.category && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {ticket.category}
                  </span>
                )}
                {ticket.contains_pii && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Shield className="w-2.5 h-2.5" aria-hidden="true" /> {ti("piiWarning")}
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

  const SectionHeader = ({ label, icon }: { label: string; icon: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
        {label}
      </h2>
    </div>
  );

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

      {/* Critical / SLA section */}
      {critical.length > 0 && (
        <div className="mb-6">
          <SectionHeader
            label={t("urgentSla")}
            icon={<AlertCircle className="w-4 h-4 text-red-400" />}
          />
          <div className="space-y-2">
            {critical.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {/* Agent's specialty queue */}
      {agentTeamId && myTeam.length > 0 && (
        <div className="mb-6">
          <SectionHeader
            label={t("mySpecialty")}
            icon={<Zap className="w-4 h-4 text-indigo-400" />}
          />
          <div className="space-y-2">
            {myTeam.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {/* Other tickets */}
      {others.length > 0 && (
        <div>
          {(agentTeamId && myTeam.length > 0) && (
            <SectionHeader
              label={t("otherTickets")}
              icon={<Clock className="w-4 h-4 text-[var(--color-text-muted)]" />}
            />
          )}
          <div className="space-y-2">
            {others.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

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
