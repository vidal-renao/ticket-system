import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import {
  applyTicketSlaFilter,
  debugTicketFilters,
  formatAgentIdentity,
  getInitials,
  getTicketIdsBySuggestedCategory,
  getTicketsByRole,
} from "@/lib/ticket-visibility";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { Button } from "@/components/ui/Button";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import {
  TicketIcon,
  PlusCircle,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import {
  formatTicketRef,
  statusColor,
  formatRelativeTime,
  formatDateTime,
  formatDuration,
} from "@/lib/utils";
import { getTicketPresentation } from "@/lib/ticket-presentation";

export const dynamic = "force-dynamic";

type CustomerTicket = {
  id: string;
  ticket_number: number;
  title: string;
  created_by: string;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
};

type StaffTicket = {
  id: string;
  ticket_number: number;
  title: string;
  created_by: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  sla_breached: boolean | null;
  response_due_at: string | null;
  resolution_due_at: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  first_response_at: string | null;
  first_agent_response_at: string | null;
  metadata?: unknown;
};

export async function generateMetadata() {
  const t = await getTranslations("tickets");
  return { title: t("myTickets") };
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; priority?: string; sla?: string; category?: string; specialty?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const t = await getTranslations("tickets");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id) redirect(loginPath);

  const isStaff = isStaffRole(profile.role);
  const isCustomer = profile.role === "customer";

  const staffQueryOptions = profile.role === "agent" ? { includeUnassignedForAgents: false } : undefined;
  let filteredTicketIds: string[] | null = null;

  if (isStaff && filters.category) {
    filteredTicketIds = await getTicketIdsBySuggestedCategory(svc, profile.organization_id, filters.category);
  }

  if (isStaff && filters.specialty === "mine") {
    const specialty = profile.specialty?.trim();
    filteredTicketIds = specialty ? await getTicketIdsBySuggestedCategory(svc, profile.organization_id, specialty) : [];
  }

  let staffTicketsQuery = getTicketsByRole(
    svc,
    profile,
    "id, ticket_number, title, created_by, status, priority, created_at, updated_at, assigned_to, sla_breached, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due, first_response_at, first_agent_response_at, metadata",
    staffQueryOptions
  );

  if (isStaff && filters.status && ["open", "in_progress", "pending_customer", "resolved", "closed"].includes(filters.status)) {
    staffTicketsQuery = staffTicketsQuery.eq("status", filters.status);
  }

  if (isStaff && filters.priority && ["low", "medium", "high", "critical"].includes(filters.priority)) {
    staffTicketsQuery = staffTicketsQuery.eq("priority", filters.priority);
  }

  if (isStaff) {
    staffTicketsQuery = applyTicketSlaFilter(staffTicketsQuery, filters.sla);
    debugTicketFilters("[TicketsPage] scoped staff filters", {
      userId: user.id,
      role: profile.role,
      filters,
      includeUnassignedForAgents: staffQueryOptions?.includeUnassignedForAgents ?? true,
    });
  }

  if (isStaff && filteredTicketIds) {
    staffTicketsQuery = staffTicketsQuery.in("id", filteredTicketIds.length ? filteredTicketIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: tickets, error } = isStaff
    ? await staffTicketsQuery.order("created_at", { ascending: false }).limit(100)
    : await getTicketsByRole(svc, profile, "id, ticket_number, title, created_by, status, priority, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(100);

  if (error) console.error("[TicketsPage] query error:", error.message);

  const aiCategoryMap: Record<string, string | null> = {};
  if (tickets && tickets.length > 0) {
    const ticketIds = (tickets as { id: string }[]).map((ticket) => ticket.id);
    const { data: aiRows, error: aiError } = await svc
      .from("ai_analysis")
      .select("ticket_id, suggested_category")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false });
    if (aiError) console.error("[TicketsPage] ai_analysis query error:", aiError.message);
    if (aiRows) {
      for (const row of aiRows) {
        if (!(row.ticket_id in aiCategoryMap)) aiCategoryMap[row.ticket_id] = row.suggested_category ?? null;
      }
    }
  }

  const newTicketPath = locale === "de" ? "/tickets/new" : `/${locale}/tickets/new`;
  const customerTickets = (tickets ?? []) as CustomerTicket[];
  const staffTickets = (tickets ?? []) as StaffTicket[];
  const openCustomerTickets = customerTickets.filter((ticket) => !isResolved(ticket.status));
  const resolvedCustomerTickets = customerTickets.filter((ticket) => isResolved(ticket.status));
  const staffBreachedCount = staffTickets.filter((ticket) => getTicketListSlaState(ticket).key === "breached").length;
  const allVisibleTickets = (tickets ?? []) as Array<CustomerTicket | StaffTicket>;

  const creatorIds = [...new Set(allVisibleTickets.map((ticket) => ticket.created_by).filter(Boolean))];
  const assigneeIds = [...new Set(staffTickets.map((ticket) => ticket.assigned_to).filter((value): value is string => Boolean(value)))];

  const [{ data: organization }, { data: customerCompanyRows }, { data: staffProfileRows }, { count: assignedCount }] = await Promise.all([
    svc.from("organizations").select("name, slug, plan, tier, settings").eq("id", profile.organization_id).single(),
    creatorIds.length
      ? svc.from("customers_info").select("id, company_name, industry").in("id", creatorIds)
      : Promise.resolve({ data: [] as { id: string; company_name: string; industry: string }[] }),
    assigneeIds.length
      ? svc.from("profiles").select("id, full_name, specialty").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; specialty: string | null }[] }),
    isStaff
      ? svc.from("tickets").select("id", { count: "exact", head: true }).eq("assigned_to", user.id).in("status", ["open", "in_progress", "pending_customer"])
      : Promise.resolve({ count: 0 }),
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
    ((staffProfileRows ?? []) as { id: string; full_name: string | null; specialty: string | null }[]).map((row) => [row.id, row])
  );

  const companyCode = organization?.slug?.toUpperCase() ?? "ORG";
  const currentInitials = getInitials(profile.full_name);
  const availableCategories = [...new Set(Object.values(aiCategoryMap).filter((value): value is string => Boolean(value)))].sort();
  const visibleStaffTickets = staffTickets;

  function ticketsFilterHref(next: { status?: string; priority?: string; sla?: string; category?: string; specialty?: string }) {
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
    const base = locale === "de" ? "/tickets" : `/${locale}/tickets`;
    return query ? `${base}?${query}` : base;
  }

  function clearTicketsFilterHref(key: "status" | "priority" | "sla" | "category" | "specialty") {
    return ticketsFilterHref({ [key]: "" });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {isCustomer || profile.role === "agent" ? "My Tickets" : t("allTickets")}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            {t("totalCount", { count: isStaff ? visibleStaffTickets.length : tickets?.length ?? 0 })}
          </p>
        </div>
        {isCustomer && (
          <Link href={newTicketPath}>
            <Button size="sm">
              <PlusCircle className="h-4 w-4" />
              {t("newTicket")}
            </Button>
          </Link>
        )}
      </div>

      {(isCustomer || profile.role === "agent") && (
        <Card className="mb-5 p-4">
          <div className="flex items-center gap-3">
            <PresenceAvatar
              name={profile.full_name?.trim() || "User"}
              status={profile.availability_status}
              queueCount={isStaff ? assignedCount ?? 0 : null}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {profile.role === "agent"
                  ? `${profile.full_name?.trim() || "Agent"} · ${companyCode}`
                  : `${organization?.name ?? "Organization"} · ${companyCode}`}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {profile.role === "agent"
                  ? profile.specialty?.trim() || "General support"
                  : companyContextByCreator[user.id]?.sector || "General"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {isStaff && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Assigned</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{staffTickets.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Queue</p>
              <Link href={locale === "de" ? "/queue" : `/${locale}/queue`} className="mt-2 inline-flex items-center gap-2 text-3xl font-semibold text-[var(--color-text-primary)] transition-colors hover:text-indigo-300">
                {assignedCount ?? 0}
                <ArrowRight className="h-4 w-4 text-indigo-300" />
              </Link>
            </Card>
            <Card className="border-red-500/20 bg-red-950/20 p-4">
              <p className="text-xs uppercase tracking-wider text-red-200/80">Breached</p>
              <p className="mt-2 text-3xl font-semibold text-red-200">{staffBreachedCount}</p>
            </Card>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2">
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
                  href={active ? clearTicketsFilterHref(key) : ticketsFilterHref({ [key]: filter.value })}
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
                  href={active ? clearTicketsFilterHref("category") : ticketsFilterHref({ category })}
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
            {profile.role === "agent" && profile.specialty?.trim() && (
              <Link
                href={filters.specialty === "mine" ? clearTicketsFilterHref("specialty") : ticketsFilterHref({ specialty: "mine" })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  filters.specialty === "mine"
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-[var(--color-surface-500)]"
                }`}
              >
                Specialty: {profile.specialty.trim()}
              </Link>
            )}
          </div>
        </>
      )}

      {!tickets || tickets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="mb-3 h-10 w-10 text-[var(--color-text-muted)]" />
          <p className="font-medium text-[var(--color-text-secondary)]">{t("noTickets")}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {isCustomer ? t("noTicketsCustomer") : t("noTicketsStaff")}
          </p>
          {isCustomer && (
            <Link href={newTicketPath} className="mt-4">
              <Button size="sm">
                <PlusCircle className="h-4 w-4" /> {t("newTicket")}
              </Button>
            </Link>
          )}
        </Card>
      ) : isCustomer ? (
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Open tickets</h2>
              <span className="text-xs text-[var(--color-text-muted)]">{openCustomerTickets.length}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--color-surface-600)] shadow-sm shadow-black/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
                    <th className="w-24 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Ref</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] md:table-cell">{t("summary")}</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] sm:table-cell">{t("category")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Status</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] lg:table-cell">{t("opened")}</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] xl:table-cell">{t("resolved")}</th>
                    <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] lg:table-cell">{t("duration")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-surface-700)]">
                  {openCustomerTickets.map((ticket) => {
                    const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                    const aiCategory = aiCategoryMap[ticket.id] ?? null;
                    const resolved = isResolved(ticket.status);
                    const active = isActive(ticket.status);
                    const companyContext = companyContextByCreator[ticket.created_by];

                    return (
                      <tr key={ticket.id} className="transition-colors hover:bg-[var(--color-surface-800)]">
                        <td className="px-4 py-3">
                          <Link href={ticketPath} className="font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300">
                            {formatTicketRef(ticket.ticket_number)}
                          </Link>
                        </td>
                        <td className="hidden max-w-xs px-4 py-3 md:table-cell">
                          <Link href={ticketPath} className="block text-sm text-[var(--color-text-primary)] transition-colors hover:text-indigo-300">
                            <span className="block truncate">{ticket.title}</span>
                            <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
                              {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                            </span>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          {aiCategory ? (
                            <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                              {aiCategory}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] italic text-[var(--color-text-muted)]">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                              Classifying...
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {active ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-blue-400">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                {ts(ticket.status)}
                              </span>
                            ) : resolved ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-violet-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                {ts(ticket.status)}
                              </span>
                            ) : (
                              <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          <span className="tabular-nums text-xs text-[var(--color-text-muted)]">{formatDateTime(ticket.created_at)}</span>
                        </td>
                        <td className="hidden px-4 py-3 xl:table-cell">
                          {ticket.resolved_at ? (
                            <span className="tabular-nums text-xs text-violet-300">{formatDateTime(ticket.resolved_at)}</span>
                          ) : (
                            <span className="text-xs text-[var(--color-text-muted)]">Pending</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-right lg:table-cell">
                          <span className={`tabular-nums text-xs ${resolved ? "text-violet-300" : "text-[var(--color-text-muted)]"}`}>
                            {formatDuration(ticket.created_at, ticket.resolved_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Resolved</h2>
              <span className="text-xs text-[var(--color-text-muted)]">{resolvedCustomerTickets.length}</span>
            </div>
            <div className="space-y-2">
              {resolvedCustomerTickets.map((ticket) => {
                const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                const companyContext = companyContextByCreator[ticket.created_by];
                return (
                  <Link key={ticket.id} href={ticketPath}>
                    <Card hover className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="mb-1 text-xs font-mono text-indigo-400">{formatTicketRef(ticket.ticket_number)}</p>
                          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{ticket.title}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
                          <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                          <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">
                            {ticket.resolved_at ? formatDateTime(ticket.resolved_at) : formatRelativeTime(ticket.created_at)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <ol role="list" aria-label="Tickets" className="space-y-3">
          {visibleStaffTickets.map((ticket) => {
            const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
            const slaState = getTicketListSlaState(ticket);
            const companyContext = companyContextByCreator[ticket.created_by];
            const assignedProfile = ticket.assigned_to ? assigneeById[ticket.assigned_to] : null;
            const assigneeLabel = ticket.assigned_to ? formatAgentIdentity(assignedProfile) : "Unassigned";
            const assigneeName = assignedProfile?.full_name?.trim() || assigneeLabel;
            const presentation = getTicketPresentation({
              priority: ticket.priority,
              metadata: (ticket as StaffTicket).metadata,
              organization: organization ?? null,
            });

            return (
              <li key={ticket.id} role="listitem">
                <Link href={ticketPath} aria-label={`${formatTicketRef(ticket.ticket_number)}: ${ticket.title}, ${ticket.priority} priority, ${ticket.status}`}>
                  <Card hover className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5">
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
                        <p className="mb-1 text-xs font-mono text-[var(--color-text-muted)]">{formatTicketRef(ticket.ticket_number)}</p>
                        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{ticket.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                          </span>
                          <span className="inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                            <PresenceAvatar name={assigneeName} status={ticket.assigned_to ? "online" : "offline"} size="sm" />
                            {assigneeLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <PriorityBadge
                          priority={ticket.priority}
                          accentPriority={presentation.priorityTone}
                          label={presentation.priorityLabel === "emergency" ? "Emergency" : tp(ticket.priority)}
                        />
                        {presentation.isVip && (
                          <Badge className="border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200">VIP</Badge>
                        )}
                        <Badge className={`${slaState.className} text-[10px]`}>{slaState.label}</Badge>
                        <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                        <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(ticket.updated_at)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function isResolved(status: string) {
  return status === "resolved" || status === "closed";
}

function isActive(status: string) {
  return status === "in_progress";
}

function getTicketListSlaState(ticket: {
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
  const isResolvedTicket = ticket.status === "resolved" || ticket.status === "closed";

  const breached = Boolean(
    ticket.sla_breached ||
      (responseDue && !firstResponseAt && now > new Date(responseDue).getTime()) ||
      (resolutionDue && !isResolvedTicket && now > new Date(resolutionDue).getTime())
  );

  if (breached) {
    return {
      key: "breached",
      label: "SLA breached",
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    };
  }

  const dueDates = [!firstResponseAt ? responseDue : null, !isResolvedTicket ? resolutionDue : null]
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
