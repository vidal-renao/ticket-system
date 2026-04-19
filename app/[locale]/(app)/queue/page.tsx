import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, Clock, Zap, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OTHERS_PAGE_SIZE = 15;

export async function generateMetadata() {
  const t = await getTranslations("queue");
  return { title: t("title") };
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function QueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale }       = await params;
  const { page: pageStr } = await searchParams;
  const t  = await getTranslations("queue");
  const tp = await getTranslations("priority");
  const ti = await getTranslations("ticket");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();

  // Auth-safe query (columns that always exist)
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    redirect(ticketsPath);
  }

  const orgId = profile.organization_id ?? "00000000-0000-0000-0000-000000000000";

  // Safely fetch specialty — column may not exist until migration runs
  const { data: agentExtras } = await svc
    .from("profiles")
    .select("specialty")
    .eq("id", user.id)
    .single();
  const agentSpecialty: string | null =
    (agentExtras as { specialty?: string | null } | null)?.specialty ?? null;

  const { data: ticketsRaw, error: ticketsError } = await svc
    .from("tickets")
    .select(
      "id, ticket_number, title, status, priority, created_at, sla_breached, sla_resolution_due, contains_pii, assigned_to"
    )
    .eq("organization_id", orgId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  if (ticketsError) console.error("[QueuePage] tickets query error:", ticketsError.message);

  type RawTicket = {
    id: string;
    ticket_number: number;
    title: string;
    status: string;
    priority: string;
    created_at: string;
    sla_breached?: boolean;
    contains_pii?: boolean;
    assigned_to?: string | null;
  };

  type AiRow = {
    ticket_id: string;
    suggested_category?: string | null;
    suggested_priority?: string;
    sentiment?: string;
    confidence_score?: number;
    summary?: string;
  };

  const rawList   = (ticketsRaw ?? []) as RawTicket[];
  const ticketIds = rawList.map((t) => t.id);

  const { data: aiRows, error: aiError } = ticketIds.length
    ? await svc
        .from("ai_analysis")
        .select("ticket_id, suggested_category, suggested_priority, sentiment, confidence_score, summary")
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: false })
    : { data: [] as AiRow[], error: null };

  if (aiError) console.error("[QueuePage] ai_analysis query error:", aiError.message);

  const aiByTicket: Record<string, AiRow> = {};
  for (const row of (aiRows ?? []) as AiRow[]) {
    if (!(row.ticket_id in aiByTicket)) aiByTicket[row.ticket_id] = row;
  }

  type TicketWithAI = RawTicket & { ai: AiRow | null };

  const tickets: TicketWithAI[] = rawList.map((t) => ({
    ...t,
    ai: aiByTicket[t.id] ?? null,
  }));

  // Sort: SLA breached → assigned to me → priority
  const sorted = [...tickets].sort((a, b) => {
    if (a.sla_breached && !b.sla_breached) return -1;
    if (!a.sla_breached && b.sla_breached) return 1;
    const aMe = a.assigned_to === user.id;
    const bMe = b.assigned_to === user.id;
    if (aMe && !bMe) return -1;
    if (!aMe && bMe) return 1;
    return (
      (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3) -
      (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3)
    );
  });

  const critical  = sorted.filter((t) => t.priority === "critical" || t.sla_breached);
  const myTickets = sorted.filter(
    (t) => !t.sla_breached && t.priority !== "critical" && t.assigned_to === user.id
  );
  const mySpecialty = agentSpecialty
    ? sorted.filter(
        (t) =>
          !t.sla_breached &&
          t.priority !== "critical" &&
          t.assigned_to !== user.id &&
          t.ai?.suggested_category?.toLowerCase() === agentSpecialty.toLowerCase()
      )
    : [];
  const mySpecialtyIds = new Set(mySpecialty.map((t) => t.id));
  const others = sorted.filter(
    (t) =>
      !t.sla_breached &&
      t.priority !== "critical" &&
      t.assigned_to !== user.id &&
      !mySpecialtyIds.has(t.id)
  );

  // Pagination applies only to "Others" section
  const currentPage  = Math.max(1, parseInt(pageStr ?? "1", 10));
  const totalOthersPages = Math.max(1, Math.ceil(others.length / OTHERS_PAGE_SIZE));
  const safePage     = Math.min(currentPage, totalOthersPages);
  const pagedOthers  = others.slice((safePage - 1) * OTHERS_PAGE_SIZE, safePage * OTHERS_PAGE_SIZE);

  function othersPageHref(p: number) {
    const base = locale === "de" ? "/queue" : `/${locale}/queue`;
    return p > 1 ? `${base}?page=${p}` : base;
  }

  function TicketCard({ ticket }: { ticket: TicketWithAI }) {
    const ticketPath =
      locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
    const aiCategory = ticket.ai?.suggested_category ?? null;

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
                {aiCategory ? (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {aiCategory}
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--color-text-muted)] italic">
                    {ti("aiProcessing")}
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
              {ticket.ai?.summary && (
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {ticket.ai.summary}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {ticket.ai?.sentiment && (
                <span className="text-base" title={ticket.ai.sentiment}>
                  {sentimentIcon(ticket.ai.sentiment)}
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

  function SectionHeader({
    label,
    count,
    icon,
  }: {
    label: string;
    count: number;
    icon: React.ReactNode;
  }) {
    return (
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          {label}
        </h2>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">{count}</span>
      </div>
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

      {/* Critical / SLA */}
      {critical.length > 0 && (
        <div className="mb-6">
          <SectionHeader
            label={t("urgentSla")}
            count={critical.length}
            icon={<AlertCircle className="w-4 h-4 text-red-400" />}
          />
          <div className="space-y-2">
            {critical.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        </div>
      )}

      {/* Assigned to me */}
      {myTickets.length > 0 && (
        <div className="mb-6">
          <SectionHeader
            label={t("myTickets")}
            count={myTickets.length}
            icon={<Zap className="w-4 h-4 text-indigo-400" />}
          />
          <div className="space-y-2">
            {myTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        </div>
      )}

      {/* My specialty */}
      {mySpecialty.length > 0 && (
        <div className="mb-6">
          <SectionHeader
            label={t("mySpecialty")}
            count={mySpecialty.length}
            icon={<Zap className="w-4 h-4 text-violet-400" />}
          />
          <div className="space-y-2">
            {mySpecialty.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>
        </div>
      )}

      {/* Others — paginated */}
      {others.length > 0 && (
        <div>
          <SectionHeader
            label={t("otherTickets")}
            count={others.length}
            icon={<Clock className="w-4 h-4 text-[var(--color-text-muted)]" />}
          />
          <div className="space-y-2 mb-4">
            {pagedOthers.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </div>

          {/* Pagination */}
          {totalOthersPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[var(--color-text-muted)]">
                {(safePage - 1) * OTHERS_PAGE_SIZE + 1}–
                {Math.min(safePage * OTHERS_PAGE_SIZE, others.length)} of {others.length}
              </p>
              <div className="flex items-center gap-1">
                {safePage > 1 && (
                  <Link
                    href={othersPageHref(safePage - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </Link>
                )}
                {Array.from({ length: Math.min(totalOthersPages, 7) }, (_, i) => {
                  const p = Math.max(1, Math.min(safePage - 3, totalOthersPages - 6)) + i;
                  return (
                    <Link
                      key={p}
                      href={othersPageHref(p)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs transition-colors ${
                        p === safePage
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]"
                      }`}
                    >
                      {p}
                    </Link>
                  );
                })}
                {safePage < totalOthersPages && (
                  <Link
                    href={othersPageHref(safePage + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}
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
