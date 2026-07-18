import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminStatusTabs } from "@/components/admin/AdminStatusTabs";
import { AdminPageControls } from "@/components/admin/AdminPageControls";
import { AdminTicketActions } from "@/components/admin/AdminTicketActions";
import { TicketCleanupControls } from "@/components/admin/TicketCleanupControls";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { formatAgentIdentity } from "@/lib/ticket-visibility";
import { getTicketPresentation } from "@/lib/ticket-presentation";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";
import {
  Building2,
  TicketIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  ShieldAlert,
  Users,
  BriefcaseBusiness,
  UserCog,
} from "lucide-react";
import { formatRelativeTime, formatTicketRef, statusColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

type RawTicket = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  created_by: string;
  assigned_to: string | null;
  sla_breached: boolean | null;
  category_id: string | null;
  metadata?: unknown;
  review_status: "not_requested" | "pending" | "approved" | "changes_requested";
  deleted_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
  specialty: string | null;
  availability_status: "online" | "offline" | "busy" | null;
};

type CustomerInfo = { id: string; company_name: string };
type CategoryRow = { id: string; name: string };
type TeamRow = { id: string; name: string };
type AiRow = { ticket_id: string; suggested_category: string | null };

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    company?: string;
    priority?: string;
    status?: string;
    stage?: string;
    category?: string;
    agent?: string;
    sla?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const t = await getTranslations("admin");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

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

  if (!profile || !["admin", "manager"].includes(profile.role)) redirect(ticketsPath);
  if (!profile.organization_id) redirect(ticketsPath);

  const orgId = profile.organization_id;

  const [{ data: ticketsRaw }, { data: allProfiles }, { data: categoriesRaw }, { data: teamsRaw }, { data: organization }] = await Promise.all([
    (() => {
      let query = svc
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, created_by, assigned_to, sla_breached, category_id, metadata, review_status, deleted_at")
        .eq("organization_id", orgId)
        .limit(500);

      if (filters.stage === "trash") query = query.not("deleted_at", "is", null);
      else query = query.is("deleted_at", null);

      if (filters.status) query = query.eq("status", filters.status);
      else if (filters.stage === "new") query = query.eq("status", "open").is("assigned_to", null);
      else if (filters.stage === "assigned") query = query.eq("status", "open").not("assigned_to", "is", null);
      else if (filters.stage === "in_progress") query = query.eq("status", "in_progress").neq("review_status", "pending");
      else if (filters.stage === "waiting") query = query.in("status", ["pending_customer", "pending_third_party"]);
      else if (filters.stage === "ready") query = query.eq("review_status", "pending");
      else if (filters.stage === "processed") query = query.in("status", ["resolved", "closed"]);
      else if (filters.stage !== "trash") query = query.in("status", ACTIVE_TICKET_STATUSES);
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.agent === "unassigned") query = query.is("assigned_to", null);
      else if (filters.agent) query = query.eq("assigned_to", filters.agent);
      if (filters.sla === "breached") query = query.eq("sla_breached", true);
      if (filters.sla === "on_track") query = query.eq("sla_breached", false);

      switch (filters.sort) {
        case "created_at_asc":
          return query.order("created_at", { ascending: true });
        case "priority":
          return query.order("priority", { ascending: false }).order("created_at", { ascending: false });
        case "sla":
          return query.order("sla_breached", { ascending: false }).order("created_at", { ascending: false });
        case "status":
          return query.order("status", { ascending: true }).order("created_at", { ascending: false });
        default:
          return query.order("created_at", { ascending: false });
      }
    })(),
    svc.from("profiles").select("id, full_name, role, specialty, availability_status").eq("organization_id", orgId),
    svc.from("categories").select("id, name").eq("organization_id", orgId).order("name"),
    svc.from("teams").select("id, name").eq("organization_id", orgId).order("name"),
    svc.from("organizations").select("name, slug, plan, tier, settings").eq("id", orgId).single(),
  ]);

  const tickets = (ticketsRaw ?? []) as RawTicket[];
  const profiles = (allProfiles ?? []) as ProfileRow[];
  const categories = (categoriesRaw ?? []) as CategoryRow[];
  const teams = (teamsRaw ?? []) as TeamRow[];

  const customerIds = profiles.filter((entry) => entry.role === "customer").map((entry) => entry.id);
  const { data: customerInfosRaw } = customerIds.length
    ? await svc.from("customers_info").select("id, company_name").in("id", customerIds)
    : { data: [] as CustomerInfo[] };

  const uncategorisedIds = tickets.filter((ticket) => !ticket.category_id).map((ticket) => ticket.id);
  const { data: aiRowsRaw } = uncategorisedIds.length
    ? await svc.from("ai_analysis").select("ticket_id, suggested_category").in("ticket_id", uncategorisedIds).order("created_at", { ascending: false })
    : { data: [] as AiRow[] };

  const profileById = Object.fromEntries(profiles.map((entry) => [entry.id, entry]));
  const companyById = Object.fromEntries(((customerInfosRaw ?? []) as CustomerInfo[]).map((entry) => [entry.id, entry.company_name]));
  const categoryById = Object.fromEntries(categories.map((entry) => [entry.id, entry.name]));

  const aiByTicket: Record<string, string | null> = {};
  for (const row of (aiRowsRaw ?? []) as AiRow[]) {
    if (!(row.ticket_id in aiByTicket)) aiByTicket[row.ticket_id] = row.suggested_category;
  }

  const enriched = tickets.map((ticket) => ({
    ...ticket,
    company_name: companyById[ticket.created_by] ?? null,
    creator_name: profileById[ticket.created_by]?.full_name ?? null,
    agent_name: ticket.assigned_to ? formatAgentIdentity(profileById[ticket.assigned_to]) : null,
    category_name: ticket.category_id ? categoryById[ticket.category_id] ?? null : aiByTicket[ticket.id] ?? null,
    presentation: getTicketPresentation({
      priority: ticket.priority,
      metadata: ticket.metadata,
      organization: organization ?? null,
    }),
  }));

  // Build company list: include all org customers (even those with no tickets yet)
  const allCompanyNames = new Set<string>();
  enriched.forEach((t) => { if (t.company_name) allCompanyNames.add(t.company_name); });
  ((customerInfosRaw ?? []) as CustomerInfo[]).forEach((c) => { if (c.company_name?.trim()) allCompanyNames.add(c.company_name.trim()); });
  if (organization?.name?.trim()) allCompanyNames.add(organization.name.trim());
  const companies = [...allCompanyNames].sort();
  const allAgents = profiles
    .filter((entry) => entry.role === "agent")
    .map((entry) => ({ id: entry.id, name: formatAgentIdentity(entry) }));
  const categoryNames = [...new Set([...categories.map((entry) => entry.name), ...Object.values(aiByTicket).filter((value): value is string => Boolean(value))])].sort();

  const filtered = enriched
    .filter((ticket) => !filters.company || ticket.company_name === filters.company)
    .filter((ticket) => !filters.category || ticket.category_name === filters.category);

  const currentPage = Math.max(1, parseInt(filters.page ?? "1", 10));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCount = filtered.filter((ticket) => ticket.status === "open").length;
  const criticalCount = filtered.filter((ticket) => ticket.priority === "critical").length;
  const breachedCount = filtered.filter((ticket) => ticket.sla_breached).length;
  const staffEntries = profiles.filter((entry) => entry.role === "agent");
  const onlineStaffCount = staffEntries.filter((entry) => entry.availability_status === "online").length;
  const queueByAgent = Object.fromEntries(
    staffEntries.map((entry) => [
      entry.id,
      filtered.filter(
        (ticket) =>
          ticket.assigned_to === entry.id &&
          ACTIVE_TICKET_STATUSES.includes(ticket.status as (typeof ACTIVE_TICKET_STATUSES)[number])
      ).length,
    ])
  );

  const hasFilters = Boolean(
      filters.company ||
      filters.stage ||
      filters.priority ||
      filters.status ||
      filters.category ||
      filters.agent ||
      filters.sla ||
      filters.sort
  );

  function pageHref(page: number) {
    const search = new URLSearchParams();
    if (filters.company) search.set("company", filters.company);
    if (filters.priority) search.set("priority", filters.priority);
    if (filters.status) search.set("status", filters.status);
    if (filters.stage) search.set("stage", filters.stage);
    if (filters.category) search.set("category", filters.category);
    if (filters.agent) search.set("agent", filters.agent);
    if (filters.sla) search.set("sla", filters.sla);
    if (filters.sort) search.set("sort", filters.sort);
    if (page > 1) search.set("page", String(page));
    const base = locale === "de" ? "/admin" : `/${locale}/admin`;
    const query = search.toString();
    return query ? `${base}?${query}` : base;
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-400" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {filtered.length} tickets
            {hasFilters && <span className="ml-1 text-indigo-300">· filtered</span>}
            {totalPages > 1 && (
              <span className="ml-1 text-[var(--color-text-muted)]">
                · page {safePage} of {totalPages}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={locale === "de" ? "/admin/users" : `/${locale}/admin/users`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:border-indigo-500/30 hover:text-indigo-400 transition-colors"
          >
            <UserCog className="h-3.5 w-3.5" />
            Manage Users
          </Link>
          {profile.role === "admin" && <AdminPageControls teams={teams} />}
          {profile.role === "admin" && (
            <TicketCleanupControls isTrash={filters.stage === "trash"} all />
          )}
        </div>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Open volume</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{openCount}</p>
          </Card>
          <Card className="border-red-500/20 bg-red-950/20 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-red-200/80">Critical</p>
              <Flame className="h-4 w-4 text-red-300" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-red-200">{criticalCount}</p>
          </Card>
          <Card className="border-amber-500/20 bg-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-amber-200/80">SLA breached</p>
              <ShieldAlert className="h-4 w-4 text-amber-300" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-amber-200">{breachedCount}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Team online</p>
              <Users className="h-4 w-4 text-emerald-300" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">
              {onlineStaffCount}
              <span className="ml-1 text-base font-medium text-[var(--color-text-muted)]">/ {staffEntries.length}</span>
            </p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-indigo-300" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Team status</h2>
          </div>
          <div className="space-y-3">
            {staffEntries.slice(0, 5).map((agent) => (
              <div key={agent.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <PresenceAvatar
                    name={agent.full_name?.trim() || "Agent"}
                    status={agent.availability_status}
                    queueCount={queueByAgent[agent.id] ?? 0}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {agent.full_name?.trim() || "Agent"}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {agent.specialty?.trim() || "General support"}
                    </p>
                  </div>
                </div>
                <Badge className="border-[var(--color-surface-500)] bg-[var(--color-surface-700)] text-[var(--color-text-secondary)]">
                  {queueByAgent[agent.id] ?? 0} in queue
                </Badge>
              </div>
            ))}
            {staffEntries.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">No agents configured yet.</p>
            )}
          </div>
        </Card>
      </section>

      <AdminStatusTabs />

      <div className="mb-5 mt-5">
        <AdminFilters companies={companies} agents={allAgents} categories={categoryNames} />
      </div>

      {paged.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="mb-3 h-10 w-10 text-[var(--color-text-muted)]" />
          <p className="font-medium text-[var(--color-text-secondary)]">{t("noTickets")}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Try widening the filters or switching the ticket status tab.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-surface-600)] shadow-sm shadow-black/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
                <th className="w-24 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Company</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] md:table-cell">Subject</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] lg:table-cell">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] xl:table-cell">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-surface-700)]">
              {paged.map((ticket) => {
                const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                return (
                  <tr
                    key={ticket.id}
                    className={`relative transition-colors hover:bg-[var(--color-surface-800)] ${ticket.sla_breached ? "bg-red-950/20" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={ticketPath}
                        className="font-mono text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                        aria-label={`${formatTicketRef(ticket.ticket_number)}: ${ticket.title}`}
                      >
                        {formatTicketRef(ticket.ticket_number)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {ticket.company_name ? (
                        <span className="text-xs font-medium text-[var(--color-text-primary)]">{ticket.company_name}</span>
                      ) : (
                        <span className="text-xs italic text-[var(--color-text-muted)]">{t("internal")}</span>
                      )}
                    </td>
                    <td className="hidden max-w-[220px] px-4 py-3 md:table-cell">
                      <Link href={ticketPath} className="group block">
                        <span className="block truncate text-sm text-[var(--color-text-primary)] transition-colors group-hover:text-indigo-300">
                          {ticket.title}
                        </span>
                        {ticket.agent_name && (
                          <span className="block truncate text-xs text-[var(--color-text-muted)]">
                            Assigned to {ticket.agent_name}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {ticket.category_name ? (
                        <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                          {ticket.category_name}
                        </span>
                      ) : (
                        <span className="text-xs italic text-[var(--color-text-muted)]">Unclassified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <PriorityBadge
                          priority={ticket.priority}
                          accentPriority={ticket.presentation.priorityTone}
                          label={ticket.presentation.priorityLabel === "emergency" ? "Emergency" : tp(ticket.priority)}
                        />
                        {ticket.presentation.isVip && (
                          <Badge className="border-fuchsia-400/25 bg-fuchsia-500/10 text-[10px] text-fuchsia-200">VIP</Badge>
                        )}
                        {ticket.sla_breached && (
                          <Badge className="border-red-400/20 bg-red-400/10 text-[10px] text-red-300">SLA</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <span className="text-xs text-[var(--color-text-muted)]">{formatRelativeTime(ticket.created_at)}</span>
                    </td>
                    <td className="relative z-10 px-4 py-3">
                      {profile.role === "admin" ? (
                        <div className="flex items-center gap-1.5">
                          {filters.stage !== "trash" && (
                            <AdminTicketActions
                              ticketId={ticket.id}
                              currentStatus={ticket.status}
                              currentAssignee={ticket.assigned_to}
                              currentUserId={currentUserId}
                              canReassign
                              agents={allAgents}
                              reviewStatus={ticket.review_status}
                            />
                          )}
                          <TicketCleanupControls ticketId={ticket.id} isTrash={filters.stage === "trash"} />
                        </div>
                      ) : (
                        <Link href={ticketPath} className="text-xs text-[var(--color-signal-blue)]">View</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-muted)]">
            Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            {safePage > 1 && (
              <Link
                href={pageHref(safePage - 1)}
                className="flex items-center gap-1 rounded-lg border border-[var(--color-surface-600)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)] hover:text-[var(--color-text-primary)]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
              const page = Math.max(1, Math.min(safePage - 3, totalPages - 6)) + index;
              return (
                <Link
                  key={page}
                  href={pageHref(page)}
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
            {safePage < totalPages && (
              <Link
                href={pageHref(safePage + 1)}
                className="flex items-center gap-1 rounded-lg border border-[var(--color-surface-600)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-surface-500)] hover:text-[var(--color-text-primary)]"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
