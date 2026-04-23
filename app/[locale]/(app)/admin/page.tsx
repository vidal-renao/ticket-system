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
import { formatAgentIdentity } from "@/lib/ticket-visibility";
import { Building2, TicketIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTicketRef, statusColor, formatRelativeTime, priorityColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    company?: string;
    priority?: string;
    status?: string;
    category?: string;
    agent?: string;
    sla?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { locale }  = await params;
  const filters     = await searchParams;
  const t   = await getTranslations("admin");
  const tp  = await getTranslations("priority");
  const ts  = await getTranslations("status");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);
  const currentUserId = user?.id ?? "";

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, currentUserId);

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || !["admin", "manager"].includes(profile.role)) redirect(ticketsPath);
  if (!profile.organization_id) {
    console.error("[AdminPage] Missing profile organization", { userId: currentUserId });
    redirect(ticketsPath);
  }

  const orgId = profile.organization_id;

  // ── Parallel fetches ───────────────────────────────────────────────────────
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
  };

  type ProfileRow   = { id: string; full_name: string | null; role: string; specialty: string | null };
  type CustomerInfo = { id: string; company_name: string };
  type CategoryRow  = { id: string; name: string };
  type TeamRow      = { id: string; name: string };
  type AiRow        = { ticket_id: string; suggested_category: string | null };

  const [
    { data: ticketsRaw },
    { data: allProfiles },
    { data: categoriesRaw },
    { data: teamsRaw },
  ] = await Promise.all([
    (() => {
      let q = svc
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, created_by, assigned_to, sla_breached, category_id")
        .eq("organization_id", orgId)
        .limit(500);

      q = filters.status ? q.eq("status", filters.status) : q.neq("status", "closed");
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.agent === "unassigned") q = q.is("assigned_to", null);
      else if (filters.agent) q = q.eq("assigned_to", filters.agent);
      if (filters.sla === "breached") q = q.eq("sla_breached", true);
      if (filters.sla === "on_track") q = q.eq("sla_breached", false);

      switch (filters.sort) {
        case "created_at_asc":
          return q.order("created_at", { ascending: true });
        case "priority":
          return q.order("priority", { ascending: false }).order("created_at", { ascending: false });
        case "sla":
          return q.order("sla_breached", { ascending: false }).order("created_at", { ascending: false });
        case "status":
          return q.order("status", { ascending: true }).order("created_at", { ascending: false });
        default:
          return q.order("created_at", { ascending: false });
      }
    })(),
    svc
      .from("profiles")
      .select("id, full_name, role, specialty")
      .eq("organization_id", orgId),
    svc
      .from("categories")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
    svc
      .from("teams")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
  ]);

  const tickets     = (ticketsRaw   ?? []) as RawTicket[];
  const profiles    = (allProfiles  ?? []) as ProfileRow[];
  const categories  = (categoriesRaw ?? []) as CategoryRow[];
  const teams       = (teamsRaw     ?? []) as TeamRow[];

  // Fetch customer infos for company names
  const customerIds = profiles
    .filter((p) => p.role === "customer")
    .map((p) => p.id);

  const { data: customerInfosRaw } = customerIds.length
    ? await svc.from("customers_info").select("id, company_name").in("id", customerIds)
    : { data: [] as CustomerInfo[] };

  // Fetch ai_analysis for tickets without category_id
  const uncategorisedIds = tickets
    .filter((t) => !t.category_id)
    .map((t) => t.id);

  const { data: aiRowsRaw } = uncategorisedIds.length
    ? await svc
        .from("ai_analysis")
        .select("ticket_id, suggested_category")
        .in("ticket_id", uncategorisedIds)
        .order("created_at", { ascending: false })
    : { data: [] as AiRow[] };

  // Build lookup maps
  const profileById    = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const companyById    = Object.fromEntries(
    ((customerInfosRaw ?? []) as CustomerInfo[]).map((c) => [c.id, c.company_name])
  );
  const categoryById   = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const aiByTicket: Record<string, string | null> = {};
  for (const row of (aiRowsRaw ?? []) as AiRow[]) {
    if (!(row.ticket_id in aiByTicket)) aiByTicket[row.ticket_id] = row.suggested_category;
  }

  // Enrich tickets
  const enriched = tickets.map((ticket) => ({
    ...ticket,
    company_name:  companyById[ticket.created_by] ?? null,
    creator_name:  profileById[ticket.created_by]?.full_name ?? null,
    agent_name:    ticket.assigned_to ? formatAgentIdentity(profileById[ticket.assigned_to]) : null,
    category_name: ticket.category_id
      ? (categoryById[ticket.category_id] ?? null)
      : (aiByTicket[ticket.id] ?? null),
  }));

  // Build filter options
  const companies = [...new Set(
    enriched.map((t) => t.company_name).filter((c): c is string => !!c)
  )].sort();

  const allAgents = profiles
    .filter((p) => p.role === "agent")
    .map((p) => ({ id: p.id, name: formatAgentIdentity(p) }));

  const categoryNames = [
    ...new Set([
      ...categories.map((c) => c.name),
      ...Object.values(aiByTicket).filter((c): c is string => !!c),
    ]),
  ].sort();

  // Company/category remain derived labels, while core ticket filters run in the DB query above.
  const filtered = enriched
    .filter((t) => !filters.company  || t.company_name === filters.company)
    .filter((t) => !filters.category || t.category_name === filters.category);

  // Pagination
  const currentPage = Math.max(1, parseInt(filters.page ?? "1", 10));
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(currentPage, totalPages);
  const paged       = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (filters.company)  sp.set("company",  filters.company);
    if (filters.priority) sp.set("priority", filters.priority);
    if (filters.status)   sp.set("status",   filters.status);
    if (filters.category) sp.set("category", filters.category);
    if (filters.agent)    sp.set("agent",    filters.agent);
    if (filters.sla)      sp.set("sla",      filters.sla);
    if (filters.sort)     sp.set("sort",     filters.sort);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    const base = locale === "de" ? "/admin" : `/${locale}/admin`;
    return q ? `${base}?${q}` : base;
  }

  const hasFilters =
    filters.company ||
    filters.priority ||
    filters.status ||
    filters.category ||
    filters.agent ||
    filters.sla ||
    filters.sort;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-indigo-400" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {filtered.length} tickets
            {hasFilters && <span className="text-indigo-400 ml-1">· filtered</span>}
            {totalPages > 1 && (
              <span className="text-[var(--color-text-muted)] ml-1">
                · page {safePage} of {totalPages}
              </span>
            )}
          </p>
        </div>
        {profile.role === "admin" && <AdminPageControls teams={teams} />}
      </div>

      {/* Status tabs */}
      <AdminStatusTabs />

      {/* Filters */}
      <div className="mb-5">
        <AdminFilters
          companies={companies}
          agents={allAgents}
          categories={categoryNames}
        />
      </div>

      {/* Table */}
      {paged.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("noTickets")}</p>
        </Card>
      ) : (
        <div className="rounded-xl border border-[var(--color-surface-600)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider w-24">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden md:table-cell">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden xl:table-cell">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-surface-700)]">
              {paged.map((ticket) => {
                const ticketPath = locale === "de"
                  ? `/tickets/${ticket.id}`
                  : `/${locale}/tickets/${ticket.id}`;

                return (
                  <tr
                    key={ticket.id}
                    className={`relative hover:bg-[var(--color-surface-800)] transition-colors ${
                      ticket.sla_breached ? "bg-red-950/20" : ""
                    }`}
                  >
                    {/* Ref — contains the full-row overlay link */}
                    <td className="px-4 py-3">
                      <Link
                        href={ticketPath}
                        className="absolute inset-0"
                        aria-label={`${formatTicketRef(ticket.ticket_number)}: ${ticket.title}`}
                      />
                      <span className="relative font-mono text-xs text-indigo-400 pointer-events-none">
                        {formatTicketRef(ticket.ticket_number)}
                      </span>
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3">
                      <span className="relative pointer-events-none">
                        {ticket.company_name ? (
                          <span className="text-xs font-medium text-[var(--color-text-primary)]">
                            {ticket.company_name}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)] italic">
                            {t("internal")}
                          </span>
                        )}
                      </span>
                    </td>

                    {/* Subject */}
                    <td className="px-4 py-3 hidden md:table-cell max-w-[220px]">
                      <span className="relative text-sm text-[var(--color-text-primary)] truncate block pointer-events-none">
                        {ticket.title}
                      </span>
                      {ticket.agent_name && (
                        <span className="relative text-xs text-[var(--color-text-muted)] truncate block pointer-events-none">
                          → {ticket.agent_name}
                        </span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="relative pointer-events-none">
                        {ticket.category_name ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {ticket.category_name}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)] italic">—</span>
                        )}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <div className="relative flex items-center gap-1 pointer-events-none">
                        <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
                        {ticket.sla_breached && (
                          <Badge className="text-red-400 bg-red-400/10 border-red-400/20 text-[10px]">SLA!</Badge>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className="relative pointer-events-none">
                        <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="relative text-xs text-[var(--color-text-muted)] pointer-events-none">
                        {formatRelativeTime(ticket.created_at)}
                      </span>
                    </td>

                    {/* Actions — stops propagation of overlay link */}
                    <td className="px-4 py-3 relative z-10">
                      <AdminTicketActions
                        ticketId={ticket.id}
                        currentStatus={ticket.status}
                        currentAssignee={ticket.assigned_to}
                        currentUserId={currentUserId}
                        canReassign={profile.role === "admin" || profile.role === "manager"}
                        agents={allAgents}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-[var(--color-text-muted)]">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            {safePage > 1 && (
              <Link
                href={pageHref(safePage - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = Math.max(1, Math.min(safePage - 3, totalPages - 6)) + i;
              return (
                <Link
                  key={p}
                  href={pageHref(p)}
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
            {safePage < totalPages && (
              <Link
                href={pageHref(safePage + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
