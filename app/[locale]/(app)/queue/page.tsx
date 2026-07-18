import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import {
  applyTicketSlaFilter,
  debugTicketFilters,
  formatAgentIdentity,
  getTicketIdsBySuggestedCategory,
  getTicketsByRole,
} from "@/lib/ticket-visibility";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AssignToMeButton } from "@/components/tickets/AssignToMeButton";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { AlertCircle, Clock, Zap, Shield, ChevronLeft, ChevronRight, Gauge, Layers3 } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon, formatRelativeTime } from "@/lib/utils";
import { getTicketPresentation } from "@/lib/ticket-presentation";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

const OTHERS_PAGE_SIZE = 15;

export async function generateMetadata() {
  const t = await getTranslations("queue");
  return { title: t("title") };
}

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
  metadata?: unknown;
};

type AiRow = {
  ticket_id: string;
  suggested_category?: string | null;
  suggested_priority?: string;
  sentiment?: string;
  confidence_score?: number;
  summary?: string;
};

export default async function QueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string; priority?: string; sla?: string; category?: string; specialty?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const pageStr = filters.page;
  const t = await getTranslations("queue");
  const tp = await getTranslations("priority");
  const ti = await getTranslations("ticket");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);
  const currentUserId = user.id;

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, currentUserId);
  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;

  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) redirect(ticketsPath);
  if (!profile.organization_id) redirect(loginPath);

  const agentSpecialty = profile.specialty ?? null;
  let filteredTicketIds: string[] | null = null;

  if (filters.category) {
    filteredTicketIds = await getTicketIdsBySuggestedCategory(svc, profile.organization_id, filters.category);
  }

  if (filters.specialty === "mine") {
    const specialty = agentSpecialty?.trim();
    filteredTicketIds = specialty ? await getTicketIdsBySuggestedCategory(svc, profile.organization_id, specialty) : [];
  }

  let ticketsQuery = getTicketsByRole(
    svc,
    profile,
    "id, ticket_number, title, created_by, status, priority, created_at, sla_breached, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due, first_response_at, first_agent_response_at, contains_pii, assigned_to, metadata"
  ).in("status", ACTIVE_TICKET_STATUSES);

  if (filters.status && ACTIVE_TICKET_STATUSES.includes(filters.status as (typeof ACTIVE_TICKET_STATUSES)[number])) {
    ticketsQuery = ticketsQuery.eq("status", filters.status);
  }

  if (filters.priority && ["low", "medium", "high", "critical"].includes(filters.priority)) {
    ticketsQuery = ticketsQuery.eq("priority", filters.priority);
  }

  ticketsQuery = applyTicketSlaFilter(ticketsQuery, filters.sla);
  debugTicketFilters("[QueuePage] scoped queue filters", {
    userId: currentUserId,
    role: profile.role,
    specialty: agentSpecialty,
    filters,
  });

  if (filteredTicketIds) {
    ticketsQuery = ticketsQuery.in("id", filteredTicketIds.length ? filteredTicketIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: ticketsRaw, error: ticketsError } = await ticketsQuery
    .order("sla_breached", { ascending: false })
    .order("priority", { ascending: false })
    .order("assigned_to", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (ticketsError) console.error("[QueuePage] tickets query error:", ticketsError.message);

  const rawList = (ticketsRaw ?? []) as RawTicket[];
  const ticketIds = rawList.map((ticket) => ticket.id);
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

  const [{ data: organization }, { data: customerCompanyRows }, { data: assigneeRows }] = await Promise.all([
    svc.from("organizations").select("name, slug, plan, tier, settings").eq("id", profile.organization_id).single(),
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
  const availableCategories = [...new Set(Object.values(aiByTicket).map((row) => row?.suggested_category).filter((value): value is string => Boolean(value)))].sort();

  const tickets = rawList.map((ticket) => ({
    ...ticket,
    ai: aiByTicket[ticket.id] ?? null,
  }));

  const myTicketCount = tickets.filter((ticket) => ticket.assigned_to === currentUserId).length;
  const queueCount = tickets.filter((ticket) => !ticket.assigned_to).length;
  const breachedCount = tickets.filter((ticket) => getSlaState(ticket).key === "breached").length;
  const critical = tickets.filter((ticket) => ticket.priority === "critical" || ticket.sla_breached);
  const myTickets = tickets.filter((ticket) => !ticket.sla_breached && ticket.priority !== "critical" && ticket.assigned_to === currentUserId);
  const mySpecialty = agentSpecialty
    ? tickets.filter(
        (ticket) =>
          !ticket.sla_breached &&
          ticket.priority !== "critical" &&
          !ticket.assigned_to &&
          ticket.ai?.suggested_category?.toLowerCase() === agentSpecialty.toLowerCase()
      )
    : [];
  const mySpecialtyIds = new Set(mySpecialty.map((ticket) => ticket.id));
  const others = tickets.filter(
    (ticket) =>
      !ticket.sla_breached && ticket.priority !== "critical" && !ticket.assigned_to && !mySpecialtyIds.has(ticket.id)
  );

  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10));
  const totalOthersPages = Math.max(1, Math.ceil(others.length / OTHERS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalOthersPages);
  const pagedOthers = others.slice((safePage - 1) * OTHERS_PAGE_SIZE, safePage * OTHERS_PAGE_SIZE);

  function othersPageHref(page: number) {
    const base = locale === "de" ? "/queue" : `/${locale}/queue`;
    const search = new URLSearchParams();
    if (filters.status) search.set("status", filters.status);
    if (filters.priority) search.set("priority", filters.priority);
    if (filters.sla) search.set("sla", filters.sla);
    if (page > 1) search.set("page", String(page));
    const query = search.toString();
    return query ? `${base}?${query}` : base;
  }

  function filterHref(next: { status?: string; priority?: string; sla?: string; category?: string; specialty?: string }) {
    const search = new URLSearchParams();
    const status = next.status ?? filters.status;
    const priority = next.priority ?? filters.priority;
    const sla = next.sla ?? filters.sla;
    const category = next.category ?? filters.category;
    const specialty = next.specialty ?? filters.specialty;
    if (status) search.set("status", status);
    if (priority) search.set("priority", priority);
    if (sla) search.set("sla", sla);
    if (category) search.set("category", category);
    if (specialty) search.set("specialty", specialty);
    const query = search.toString();
    const base = locale === "de" ? "/queue" : `/${locale}/queue`;
    return query ? `${base}?${query}` : base;
  }

  function clearFilterHref(key: "status" | "priority" | "sla" | "category" | "specialty") {
    return filterHref({ [key]: "" });
  }

  function TicketCard({ ticket }: { ticket: (typeof tickets)[number] }) {
    const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
    const aiCategory = ticket.ai?.suggested_category ?? null;
    const slaState = getSlaState(ticket);
    const companyContext = companyContextByCreator[ticket.created_by];
    const assigneeProfile = ticket.assigned_to ? assigneeById[ticket.assigned_to] : null;
    const assigneeLabel = ticket.assigned_to ? formatAgentIdentity(assigneeProfile) : "Unassigned";
    const assigneeName = assigneeProfile?.full_name?.trim() || assigneeLabel;
    const presentation = getTicketPresentation({
      priority: ticket.priority,
      metadata: ticket.metadata,
      organization: organization ?? null,
    });

    return (
      <Card hover className="p-4">
        <div className="flex items-start gap-4">
          <Link href={ticketPath} className="flex min-w-0 flex-1 items-start gap-4">
            <div className="mt-0.5 shrink-0">
              <AlertCircle
                className={`h-4 w-4 ${
                  ticket.priority === "critical"
                    ? "text-red-400"
                    : ticket.priority === "high"
                      ? "text-orange-400"
                      : ticket.priority === "medium"
                        ? "text-yellow-400"
                        : "text-green-400"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{formatTicketRef(ticket.ticket_number)}</span>
                {aiCategory ? (
                  <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                    {aiCategory}
                  </span>
                ) : (
                  <span className="text-[10px] italic text-[var(--color-text-muted)]">{ti("aiProcessing")}</span>
                )}
                {ticket.contains_pii && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Shield className="h-2.5 w-2.5" aria-hidden="true" /> {ti("piiWarning")}
                  </span>
                )}
              </div>
              <p className="mb-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">{ticket.title}</p>
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                </span>
                <span className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                  <PresenceAvatar name={assigneeName} status={ticket.assigned_to ? "online" : "offline"} size="sm" />
                  {assigneeLabel}
                </span>
              </div>
              {ticket.ai?.summary && <p className="truncate text-xs text-[var(--color-text-muted)]">{ticket.ai.summary}</p>}
            </div>
          </Link>

          <div className="flex items-start gap-4">
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <AssignToMeButton ticketId={ticket.id} currentUserId={currentUserId} currentAssignee={ticket.assigned_to} />
              {ticket.ai?.sentiment && (
                <span className="text-base" title={ticket.ai.sentiment}>
                  {sentimentIcon(ticket.ai.sentiment)}
                </span>
              )}
              <Badge className={slaState.className}>{slaState.label}</Badge>
              <Badge className={priorityColor(presentation.priorityTone)}>
                {presentation.priorityLabel === "emergency" ? "Emergency" : tp(ticket.priority)}
              </Badge>
              {presentation.isVip && (
                <Badge className="border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200">VIP</Badge>
              )}
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(ticket.created_at)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  function SectionHeader({ label, count, icon }: { label: string; count: number; icon: React.ReactNode }) {
    return (
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{label}</h2>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">{count}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{t("summary", { total: tickets.length, urgent: critical.length })}</p>
        </div>
      </div>

      <Card className="mb-5 p-4">
        <div className="flex items-center gap-3">
          <PresenceAvatar
            name={profile.full_name?.trim() || "Agent"}
            status={profile.availability_status}
            queueCount={myTicketCount}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {profile.full_name?.trim() || "Agent"} · {organization?.name ?? "Organization"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {(agentSpecialty?.trim() || "General support")} · {companyCode}
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">My tickets</p>
            <Gauge className="h-4 w-4 text-indigo-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{myTicketCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Open queue</p>
            <Layers3 className="h-4 w-4 text-blue-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{queueCount}</p>
        </Card>
        <Card className="border-red-500/20 bg-red-950/20 p-4">
          <p className="text-xs uppercase tracking-wider text-red-200/80">Breached</p>
          <p className="mt-2 text-3xl font-semibold text-red-200">{breachedCount}</p>
        </Card>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {[
          { key: "status", label: "Status", value: "open", text: "Open" },
          { key: "status", label: "Status", value: "in_progress", text: "In progress" },
          { key: "status", label: "Status", value: "pending_customer", text: "Waiting customer" },
          { key: "status", label: "Status", value: "pending_third_party", text: "Waiting third party" },
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
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-[var(--color-surface-500)]"
              }`}
            >
              {filter.label}: {filter.text}
            </Link>
          );
        })}
        {availableCategories.map((category) => {
          const active = filters.category === category;
          return (
            <Link
              key={`category-${category}`}
              href={active ? clearFilterHref("category") : filterHref({ category })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-[var(--color-surface-500)]"
              }`}
            >
              Category: {category}
            </Link>
          );
        })}
        {agentSpecialty?.trim() && (
          <Link
            href={filters.specialty === "mine" ? clearFilterHref("specialty") : filterHref({ specialty: "mine" })}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              filters.specialty === "mine"
                ? "border-indigo-500 bg-indigo-600 text-white"
                : "border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-[var(--color-surface-500)]"
            }`}
          >
            Specialty: {agentSpecialty.trim()}
          </Link>
        )}
      </div>

      {critical.length > 0 && (
        <div className="mb-6">
          <SectionHeader label={t("urgentSla")} count={critical.length} icon={<AlertCircle className="h-4 w-4 text-red-400" />} />
          <div className="space-y-3">
            {critical.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {myTickets.length > 0 && (
        <div className="mb-6">
          <SectionHeader label={t("myTickets")} count={myTickets.length} icon={<Zap className="h-4 w-4 text-indigo-400" />} />
          <div className="space-y-3">
            {myTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {mySpecialty.length > 0 && (
        <div className="mb-6">
          <SectionHeader label={t("mySpecialty")} count={mySpecialty.length} icon={<Zap className="h-4 w-4 text-violet-400" />} />
          <div className="space-y-3">
            {mySpecialty.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <SectionHeader label="Unassigned queue" count={others.length} icon={<Clock className="h-4 w-4 text-[var(--color-text-muted)]" />} />
          <div className="mb-4 space-y-3">
            {pagedOthers.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>

          {totalOthersPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[var(--color-text-muted)]">
                {(safePage - 1) * OTHERS_PAGE_SIZE + 1}-{Math.min(safePage * OTHERS_PAGE_SIZE, others.length)} of {others.length}
              </p>
              <div className="flex items-center gap-1">
                {safePage > 1 && (
                  <Link
                    href={othersPageHref(safePage - 1)}
                    className="flex items-center gap-1 rounded-lg border border-[var(--color-surface-600)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Link>
                )}
                {Array.from({ length: Math.min(totalOthersPages, 7) }, (_, index) => {
                  const page = Math.max(1, Math.min(safePage - 3, totalOthersPages - 6)) + index;
                  return (
                    <Link
                      key={page}
                      href={othersPageHref(page)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors ${
                        page === safePage
                          ? "bg-indigo-600 font-semibold text-white"
                          : "border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-[var(--color-surface-500)]"
                      }`}
                    >
                      {page}
                    </Link>
                  );
                })}
                {safePage < totalOthersPages && (
                  <Link
                    href={othersPageHref(safePage + 1)}
                    className="flex items-center gap-1 rounded-lg border border-[var(--color-surface-600)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)]"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tickets.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="mb-3 h-10 w-10 text-[var(--color-text-muted)]" />
          <p className="font-medium text-[var(--color-text-secondary)]">{t("empty")}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("emptyDesc")}</p>
        </Card>
      )}
    </div>
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
