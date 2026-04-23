import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import { applyTicketSlaFilter, formatAgentIdentity, getInitials, getTicketsByRole } from "@/lib/ticket-visibility";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { Button } from "@/components/ui/Button";
import { TicketIcon, PlusCircle, Clock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { formatTicketRef, statusColor, formatRelativeTime, formatDateTime, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  const t  = await getTranslations("tickets");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id) {
    console.error("[TicketsPage] Missing profile organization", { userId: user.id });
    redirect(loginPath);
  }

  const isStaff    = isStaffRole(profile?.role);
  const isCustomer = profile?.role === "customer";

  // ── Customer query: full columns ─────────────────────────────────────────
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

  // ── Staff query (simpler) ─────────────────────────────────────────────────
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
  };

  const staffQueryOptions = profile.role === "agent"
    ? { includeUnassignedForAgents: false }
    : undefined;

  let staffTicketsQuery = getTicketsByRole(
    svc,
    profile,
    "id, ticket_number, title, created_by, status, priority, created_at, updated_at, assigned_to, sla_breached, response_due_at, resolution_due_at, sla_first_response_due, sla_resolution_due, first_response_at, first_agent_response_at",
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
    console.info("[TicketsPage] scoped staff filters", {
      userId: user.id,
      role: profile.role,
      organizationId: profile.organization_id,
      filters,
      includeUnassignedForAgents: staffQueryOptions?.includeUnassignedForAgents ?? true,
    });
  }

  const { data: tickets, error } = isStaff
    ? await staffTicketsQuery
        .order("created_at", { ascending: false })
        .limit(100)
    : await getTicketsByRole(
        svc,
        profile,
        "id, ticket_number, title, created_by, status, priority, created_at, resolved_at"
      )
        .order("created_at", { ascending: false })
        .limit(100);

  if (error) console.error("[TicketsPage] query error:", error.message);

  // Fetch AI-suggested categories separately to avoid join issues
  let aiCategoryMap: Record<string, string | null> = {};
  if (!isStaff && tickets && tickets.length > 0) {
    const ticketIds = (tickets as { id: string }[]).map((t) => t.id);
    const { data: aiRows, error: aiError } = await svc
      .from("ai_analysis")
      .select("ticket_id, suggested_category")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false });
    if (aiError) console.error("[TicketsPage] ai_analysis query error:", aiError.message);
    // Keep only the most recent analysis per ticket
    if (aiRows) {
      for (const row of aiRows) {
        if (!(row.ticket_id in aiCategoryMap)) {
          aiCategoryMap[row.ticket_id] = row.suggested_category ?? null;
        }
      }
    }
  }

  const newTicketPath = locale === "de" ? "/tickets/new" : `/${locale}/tickets/new`;

  const isResolved = (status: string) => status === "resolved" || status === "closed";
  const isActive   = (status: string) => status === "in_progress";
  const customerTickets = (tickets ?? []) as CustomerTicket[];
  const openCustomerTickets = customerTickets.filter((ticket) => !isResolved(ticket.status));
  const resolvedCustomerTickets = customerTickets.filter((ticket) => isResolved(ticket.status));
  const staffTickets = (tickets ?? []) as StaffTicket[];
  const staffBreachedCount = staffTickets.filter((ticket) => getTicketListSlaState(ticket).key === "breached").length;
  const allVisibleTickets = (tickets ?? []) as Array<CustomerTicket | StaffTicket>;

  const creatorIds = [...new Set(allVisibleTickets.map((ticket) => ticket.created_by).filter(Boolean))];
  const assigneeIds = [...new Set(staffTickets.map((ticket) => ticket.assigned_to).filter((value): value is string => Boolean(value)))];

  const [
    { data: organization },
    { data: customerCompanyRows },
    { data: staffProfileRows },
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
    ((staffProfileRows ?? []) as { id: string; full_name: string | null; specialty: string | null }[]).map((row) => [row.id, row])
  );

  const companyCode = organization?.slug?.toUpperCase() ?? "ORG";
  const currentAgentInitials = getInitials(profile.full_name);
  const availableCategories = [...new Set(Object.values(aiCategoryMap).filter((value): value is string => Boolean(value)))].sort();
  const visibleStaffTickets = staffTickets.filter((ticket) => {
    const ticketCategory = aiCategoryMap[ticket.id] ?? "";
    if (filters.category && ticketCategory !== filters.category) return false;
    if (filters.specialty === "mine") {
      const specialty = profile.specialty?.trim().toLowerCase();
      if (!specialty) return false;
      return ticketCategory.toLowerCase() === specialty;
    }
    return true;
  });

  function ticketsFilterHref(next: { status?: string; priority?: string; sla?: string; category?: string; specialty?: string }) {
    const sp = new URLSearchParams();
    const status = next.status ?? filters.status;
    const priority = next.priority ?? filters.priority;
    const sla = next.sla ?? filters.sla;
    const category = next.category ?? filters.category;
    const specialty = next.specialty ?? filters.specialty;
    if (status) sp.set("status", status);
    if (priority) sp.set("priority", priority);
    if (sla) sp.set("sla", sla);
    if (category) sp.set("category", category);
    if (specialty) sp.set("specialty", specialty);
    const q = sp.toString();
    const base = locale === "de" ? "/tickets" : `/${locale}/tickets`;
    return q ? `${base}?${q}` : base;
  }

  function clearTicketsFilterHref(key: "status" | "priority" | "sla" | "category" | "specialty") {
    return ticketsFilterHref({ [key]: "" });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {isCustomer || profile?.role === "agent" ? "My Tickets" : t("allTickets")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {t("totalCount", { count: isStaff ? visibleStaffTickets.length : tickets?.length ?? 0 })}
          </p>
        </div>
        {isCustomer && (
          <Link href={newTicketPath}>
            <Button size="sm">
              <PlusCircle className="w-4 h-4" />
              {t("newTicket")}
            </Button>
          </Link>
        )}
      </div>

      {(isCustomer || profile.role === "agent") && (
        <Card className="p-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 flex items-center justify-center text-sm font-semibold">
              {currentAgentInitials}
            </div>
            <div className="min-w-0">
              {profile.role === "agent" && (
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {profile.full_name?.trim() || "Agent"} · {companyCode}
                </p>
              )}
              <p className={`text-sm font-medium text-[var(--color-text-primary)] ${profile.role === "agent" ? "hidden" : ""}`}>
                {organization?.name ?? "Organization"} · {companyCode}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Card className="p-3">
              <p className="text-xs text-[var(--color-text-muted)]">My Tickets</p>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{staffTickets.length}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-[var(--color-text-muted)]">Queue</p>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                <Link href={locale === "de" ? "/queue" : `/${locale}/queue`} className="hover:text-indigo-300">Open</Link>
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-[var(--color-text-muted)]">Breached</p>
              <p className="text-2xl font-semibold text-red-400">{staffBreachedCount}</p>
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
                  href={active ? clearTicketsFilterHref(key) : ticketsFilterHref({ [key]: filter.value })}
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
            {availableCategories.map((category) => {
              const active = filters.category === category;
              return (
                <Link
                  key={`category-${category}`}
                  href={active ? clearTicketsFilterHref("category") : ticketsFilterHref({ category })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "text-[var(--color-text-secondary)] border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]"
                  }`}
                >
                  Category: {category}
                </Link>
              );
            })}
            {profile.role === "agent" && profile.specialty?.trim() && (
              <Link
                href={filters.specialty === "mine" ? clearTicketsFilterHref("specialty") : ticketsFilterHref({ specialty: "mine" })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  filters.specialty === "mine"
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "text-[var(--color-text-secondary)] border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]"
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
          <TicketIcon className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("noTickets")}</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {isCustomer ? t("noTicketsCustomer") : t("noTicketsStaff")}
          </p>
          {isCustomer && (
            <Link href={newTicketPath} className="mt-4">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> {t("newTicket")}
              </Button>
            </Link>
          )}
        </Card>
      ) : isCustomer ? (
        /* ── Customer: detailed timeline table ─────────────────────────────── */
        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Open tickets
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">{openCustomerTickets.length}</span>
            </div>
            <div className="rounded-xl border border-[var(--color-surface-600)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider w-24">
                      Ref
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden md:table-cell">
                      {t("summary")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden sm:table-cell">
                      {t("category")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
                      {t("opened")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden xl:table-cell">
                      {t("resolved")}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
                      {t("duration")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-surface-700)]">
                  {openCustomerTickets.map((ticket) => {
                const ticketPath = locale === "de"
                  ? `/tickets/${ticket.id}`
                  : `/${locale}/tickets/${ticket.id}`;

                const aiCategory = aiCategoryMap[ticket.id] ?? null;
                const resolved   = isResolved(ticket.status);
                const active     = isActive(ticket.status);
                const companyContext = companyContextByCreator[ticket.created_by];

                return (
                  <tr
                    key={ticket.id}
                    className="hover:bg-[var(--color-surface-800)] transition-colors"
                  >
                    {/* Ref */}
                    <td className="px-4 py-3">
                      <Link
                        href={ticketPath}
                        className="font-mono text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {formatTicketRef(ticket.ticket_number)}
                      </Link>
                    </td>

                    {/* Summary */}
                    <td className="px-4 py-3 hidden md:table-cell max-w-xs">
                      <Link
                        href={ticketPath}
                        className="text-sm text-[var(--color-text-primary)] hover:text-indigo-300 transition-colors block"
                      >
                        <span className="truncate block">{ticket.title}</span>
                        <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
                          {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                        </span>
                      </Link>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {aiCategory ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {aiCategory}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] italic">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                          Classifying…
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {active ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-blue-400">
                            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                            {ts(ticket.status)}
                          </span>
                        ) : resolved ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            {ts(ticket.status)}
                          </span>
                        ) : (
                          <Badge className={statusColor(ticket.status)}>
                            {ts(ticket.status)}
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Opened */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                        {formatDateTime(ticket.created_at)}
                      </span>
                    </td>

                    {/* Resolved */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {ticket.resolved_at ? (
                        <span className="text-xs text-green-400 tabular-nums">
                          {formatDateTime(ticket.resolved_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 hidden lg:table-cell text-right">
                      <span className={`text-xs tabular-nums ${resolved ? "text-green-400" : "text-[var(--color-text-muted)]"}`}>
                        {formatDuration(ticket.created_at, ticket.resolved_at)}
                        {!resolved && <span className="text-[var(--color-text-muted)]"> ·</span>}
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Resolved
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">{resolvedCustomerTickets.length}</span>
            </div>
            <div className="space-y-2">
              {resolvedCustomerTickets.map((ticket) => {
                const ticketPath = locale === "de"
                  ? `/tickets/${ticket.id}`
                  : `/${locale}/tickets/${ticket.id}`;
                const companyContext = companyContextByCreator[ticket.created_by];

                return (
                  <Link key={ticket.id} href={ticketPath}>
                    <Card hover className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-indigo-400 mb-1">
                            {formatTicketRef(ticket.ticket_number)}
                          </p>
                          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {ticket.title}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            {(companyContext?.company_name ?? organization?.name ?? "Organization")} · {companyCode} · {companyContext?.sector ?? "General"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
                          <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                          <span className="hidden sm:inline text-xs text-[var(--color-text-muted)]">
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
        /* ── Staff: card list view ── */
        <ol role="list" aria-label="Tickets" className="space-y-2">
          {visibleStaffTickets.map((ticket) => {
            const ticketPath = locale === "de"
              ? `/tickets/${ticket.id}`
              : `/${locale}/tickets/${ticket.id}`;
            const slaState = getTicketListSlaState(ticket);
            const companyContext = companyContextByCreator[ticket.created_by];
            const assignedProfile = ticket.assigned_to ? assigneeById[ticket.assigned_to] : null;
            const assigneeLabel = ticket.assigned_to ? formatAgentIdentity(assignedProfile) : "Unassigned";
            const assigneeInitials = ticket.assigned_to ? getInitials(assignedProfile?.full_name) : "--";
            return (
              <li key={ticket.id} role="listitem">
                <Link
                  href={ticketPath}
                  aria-label={`${formatTicketRef(ticket.ticket_number)}: ${ticket.title} — ${ticket.priority} priority, ${ticket.status}`}
                >
                  <Card hover className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5">
                        <AlertCircle className={`w-4 h-4 ${
                          ticket.priority === "critical" ? "text-red-400" :
                          ticket.priority === "high"     ? "text-orange-400" :
                          ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-[var(--color-text-muted)] mb-1">
                          {formatTicketRef(ticket.ticket_number)}
                        </p>
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {ticket.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
                        <Badge className={`${slaState.className} text-[10px]`}>{slaState.label}</Badge>
                        <Badge className={statusColor(ticket.status)}>
                          {ts(ticket.status)}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                          <Clock className="w-3 h-3" />
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
