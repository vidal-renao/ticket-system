import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { applyTicketSlaFilter, formatAgentIdentity, getInitials, getTicketsByRole } from "@/lib/ticket-visibility";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AssignToMeButton } from "@/components/tickets/AssignToMeButton";
import { AlertCircle, Clock, Zap, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OTHERS_PAGE_SIZE = 15;

export async function generateMetadata() {
  const t = await getTranslations("queue");
  return { title: t("title") };
}

export default async function QueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string; priority?: string; sla?: string }>;
}) {
  const { locale }       = await params;
  const filters = await searchParams;
  const pageStr = filters.page;
  const t  = await getTranslations("queue");
  const tp = await getTranslations("priority");
  const ti = await getTranslations("ticket");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);
  const currentUserId = user?.id ?? "";

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, currentUserId);

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    redirect(ticketsPath);
  }

  if (!profile.organization_id) {
    console.error("[QueuePage] Missing profile organization", { userId: currentUserId });
    redirect(loginPath);
  }

  const agentSpecialty = profile.specialty ?? null;

  let ticketsQuery = getTicketsByRole(
    svc,
    profile,
    "id, ticket_number, title, created_by, status, priority, created_at, sla_breached, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due, first_response_at, first_agent_response_at, contains_pii, assigned_to"
  ).in("status", ["open", "in_progress", "pending_customer"]);

  if (filters.status && ["open", "in_progress", "pending_customer"].includes(filters.status)) {
    ticketsQuery = ticketsQuery.eq("status", filters.status);
  }

  if (filters.priority && ["low", "medium", "high", "critical"].includes(filters.priority)) {
    ticketsQuery = ticketsQuery.eq("priority", filters.priority);
  }

  ticketsQuery = applyTicketSlaFilter(ticketsQuery, filters.sla);
  console.info("[QueuePage] scoped queue filters", {
    userId: currentUserId,
    role: profile.role,
    organizationId: profile.organization_id,
    specialty: agentSpecialty,
    filters,
  });

  const { data: ticketsRaw, error: ticketsError } = await ticketsQuery
    .order("sla_breached", { ascending: false })
    .order("priority", { ascending: false })
    .order("assigned_to", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (ticketsError) console.error("[QueuePage] tickets query error:", ticketsError.message);

  type RawTicket = {
    id: string;
    ticket_number: number;
    title: string;
    created_by: string;
    status: string;
    priority: string;
    created_at: string;
    sla_breached?: boolean;
    response_due_at?: string | null;
    resolution_due_at?: string | null;
    sla_first_response_due?: string | null;
    sla_resolution_due?: string | null;
    first_response_at?: string | null;
    first_agent_response_at?: string | null;
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
  const creatorIds = [...new Set(rawList.map((ticket) => ticket.created_by).filter(Boolean))];
  const assigneeIds = [...new Set(rawList.map((ticket) => ticket.assigned_to).filter((value): value is string => Boolean(value)))];

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

  const [
    { data: organization },
    { data: customerCompanyRows },
    { data: assigneeRows },
  ] = await Promise.all([
    svc.from("organizations").select("name, slug").eq("id", profile.organization_id).single(),
    creatorIds.length
      ? svc.from("customers_info").select("id, company_name, industry").in("id", creatorIds)
      : Promise.resolve({ data: [] as { id: string; company_name: string; industry: string }[] }),
    assigneeIds.length
      ? svc.from("profiles").select("id, full_name, specialty").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; specialty: string | null }[] }),
  ]);

  const companyContextByCreator = Object.fromEntries(
    ((customerCompanyRows ?? []) as { id: string; company_name: string; industry: string }[]).map((row) => [
      row.id,
      {
        company_name: row.company_name?.trim() || organization?.name || "Organization",
        sector: row.industry?.trim() || "General",
      },
    ])
  );

  const assigneeById = Object.fromEntries(
    ((assigneeRows ?? []) as { id: string; full_name: string | null; specialty: string | null }[]).map((row) => [row.id, row])
  );

  const companyCode = organization?.slug?.toUpperCase() ?? "ORG";
  const currentAgentInitials = getInitials(profile.full_name);

  type TicketWithAI = RawTicket & { ai: AiRow | null };

  const tickets: TicketWithAI[] = rawList.map((t) => ({
    ...t,
    ai: aiByTicket[t.id] ?? null,
  }));

  const sorted = tickets;

  const myTicketCount = tickets.filter((t) => t.assigned_to === currentUserId).length;
  const queueCount = tickets.filter((t) => !t.assigned_to).length;
  const breachedCount = tickets.filter((t) => getSlaState(t).key === "breached").length;

  const critical  = sorted.filter((t) => t.priority === "critical" || t.sla_breached);
  const myTickets = sorted.filter(
    (t) => !t.sla_breached && t.priority !== "critical" && t.assigned_to === currentUserId
  );
  const mySpecialty = agentSpecialty
    ? sorted.filter(
        (t) =>
          !t.sla_breached &&
          t.priority !== "critical" &&
          !t.assigned_to &&
          t.ai?.suggested_category?.toLowerCase() === agentSpecialty.toLowerCase()
      )
    : [];
  const mySpecialtyIds = new Set(mySpecialty.map((t) => t.id));
  const others = sorted.filter(
    (t) =>
      !t.sla_breached &&
      t.priority !== "critical" &&
      !t.assigned_to &&
      !mySpecialtyIds.has(t.id)
  );

  // Pagination applies only to "Others" section
  const currentPage  = Math.max(1, parseInt(pageStr ?? "1", 10));
  const totalOthersPages = Math.max(1, Math.ceil(others.length / OTHERS_PAGE_SIZE));
  const safePage     = Math.min(currentPage, totalOthersPages);
  const pagedOthers  = others.slice((safePage - 1) * OTHERS_PAGE_SIZE, safePage * OTHERS_PAGE_SIZE);

  function othersPageHref(p: number) {
    const base = locale === "de" ? "/queue" : `/${locale}/queue`;
    const sp = new URLSearchParams();
    if (filters.status) sp.set("status", filters.status);
    if (filters.priority) sp.set("priority", filters.priority);
    if (filters.sla) sp.set("sla", filters.sla);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${base}?${q}` : base;
  }

  function filterHref(next: { status?: string; priority?: string; sla?: string }) {
    const sp = new URLSearchParams();
    const status = next.status ?? filters.status;
    const priority = next.priority ?? filters.priority;
    const sla = next.sla ?? filters.sla;
    if (status) sp.set("status", status);
    if (priority) sp.set("priority", priority);
    if (sla) sp.set("sla", sla);
    const q = sp.toString();
    const base = locale === "de" ? "/queue" : `/${locale}/queue`;
    return q ? `${base}?${q}` : base;
  }

  function clearFilterHref(key: "status" | "priority" | "sla") {
    return filterHref({ [key]: "" });
  }

  function TicketCard({ ticket }: { ticket: TicketWithAI }) {
    const ticketPath =
      locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
    const aiCategory = ticket.ai?.suggested_category ?? null;
    const slaState = getSlaState(ticket);
    const companyContext = companyContextByCreator[ticket.created_by];
    const assigneeProfile = ticket.assigned_to ? assigneeById[ticket.assigned_to] : null;
    const assigneeLabel = ticket.assigned_to ? formatAgentIdentity(assigneeProfile) : "Unassigned";
    const assigneeInitials = ticket.assigned_to ? getInitials(assigneeProfile?.full_name) : "--";

    return (
      <Card hover className="p-4">
        <div className="flex items-start gap-4">
          <Link href={ticketPath} className="flex items-start gap-4 flex-1 min-w-0">
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
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                </span>
                <span className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-semibold">
                    {assigneeInitials}
                  </span>
                  {assigneeLabel}
                </span>
              </div>
              {ticket.ai?.summary && (
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {ticket.ai.summary}
                </p>
              )}
            </div>
          </Link>
          <div className="flex items-start gap-4">
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <AssignToMeButton
                ticketId={ticket.id}
                currentUserId={currentUserId}
                currentAssignee={ticket.assigned_to}
              />
              {ticket.ai?.sentiment && (
                <span className="text-base" title={ticket.ai.sentiment}>
                  {sentimentIcon(ticket.ai.sentiment)}
                </span>
              )}
              <Badge className={slaState.className}>{slaState.label}</Badge>
              <Badge className={priorityColor(ticket.priority)}>{tp(ticket.priority)}</Badge>
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(ticket.created_at)}
              </span>
            </div>
          </div>
        </div>
      </Card>
  );
}

function getSlaState(ticket: {
  created_at: string;
  status: string;
  sla_breached?: boolean | null;
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  first_response_at?: string | null;
  first_agent_response_at?: string | null;
}) {
  const now = Date.now();
  const firstResponseAt = ticket.first_agent_response_at ?? ticket.first_response_at;
  const responseDue = ticket.response_due_at ?? ticket.sla_first_response_due;
  const resolutionDue = ticket.resolution_due_at ?? ticket.sla_resolution_due;

  const breached = Boolean(
    ticket.sla_breached ||
      (responseDue && !firstResponseAt && now > new Date(responseDue).getTime()) ||
      (resolutionDue && now > new Date(resolutionDue).getTime())
  );

  if (breached) {
    return {
      key: "breached",
      label: "SLA breached",
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    };
  }

  const dueDates = [!firstResponseAt ? responseDue : null, resolutionDue]
    .filter(Boolean)
    .map((date) => new Date(date as string).getTime());

  if (dueDates.length === 0) {
    return {
      key: "on_time",
      label: "SLA on time",
      className: "text-green-400 bg-green-400/10 border-green-400/20",
    };
  }

  const nextDue = Math.min(...dueDates);
  const totalWindow = nextDue - new Date(ticket.created_at).getTime();
  const remaining = nextDue - now;
  const oneHour = 60 * 60 * 1000;

  if (remaining <= oneHour || (totalWindow > 0 && remaining / totalWindow <= 0.25)) {
    return {
      key: "at_risk",
      label: "SLA at risk",
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    };
  }

  return {
    key: "on_time",
    label: "SLA on time",
    className: "text-green-400 bg-green-400/10 border-green-400/20",
  };
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

      <Card className="p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 flex items-center justify-center text-sm font-semibold">
            {currentAgentInitials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {profile.full_name?.trim() || "Agent"} · {organization?.name ?? "Organization"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {(agentSpecialty?.trim() || "General support")} · {companyCode}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card className="p-3">
          <p className="text-xs text-[var(--color-text-muted)]">My Tickets</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{myTicketCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Queue</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{queueCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Breached</p>
          <p className="text-2xl font-semibold text-red-400">{breachedCount}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {[
          { key: "status", label: "Status", value: "open", text: "Open" },
          { key: "status", label: "Status", value: "in_progress", text: "In progress" },
          { key: "status", label: "Status", value: "pending_customer", text: "Waiting customer" },
          { key: "priority", label: "Priority", value: "critical", text: "Critical" },
          { key: "priority", label: "Priority", value: "high", text: "High" },
          { key: "sla", label: "SLA", value: "on_time", text: "On time" },
          { key: "sla", label: "SLA", value: "at_risk", text: "At risk" },
          { key: "sla", label: "SLA", value: "breached", text: "Breached" },
        ].map((filter) => {
          const key = filter.key as "status" | "priority" | "sla";
          const active =
            (key === "status" && filters.status === filter.value) ||
            (key === "priority" && filters.priority === filter.value) ||
            (key === "sla" && filters.sla === filter.value);
          return (
            <Link
              key={`${filter.key}-${filter.value}`}
              href={active ? clearFilterHref(key) : filterHref({ [key]: filter.value })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                active
                  ? "bg-indigo-600 text-white border-indigo-500"
                  : "text-[var(--color-text-secondary)] border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]"
              }`}
            >
              {filter.label}: {filter.text}
            </Link>
          );
        })}
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
            label="Unassigned Queue"
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
