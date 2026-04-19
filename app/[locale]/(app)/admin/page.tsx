import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { Building2, TicketIcon } from "lucide-react";
import { formatTicketRef, statusColor, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ company?: string; priority?: string; agent?: string }>;
}) {
  const { locale }  = await params;
  const filters     = await searchParams;
  const t   = await getTranslations("admin");
  const tp  = await getTranslations("priority");
  const ts  = await getTranslations("status");
  const tck = await getTranslations("tickets");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || profile.role !== "admin") redirect(ticketsPath);

  const orgId = profile.organization_id ?? "00000000-0000-0000-0000-000000000000";

  // ── Fetch all tickets for the org ──────────────────────────────────────────
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
  };

  const { data: ticketsRaw } = await svc
    .from("tickets")
    .select("id, ticket_number, title, status, priority, created_at, created_by, assigned_to, sla_breached")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  const tickets = (ticketsRaw ?? []) as RawTicket[];

  // ── Batch-fetch all org profiles + customers_info ─────────────────────────
  type ProfileRow = { id: string; full_name: string; role: string };
  type CustomerInfo = { id: string; company_name: string };

  const { data: allProfiles } = await svc
    .from("profiles")
    .select("id, full_name, role")
    .eq("organization_id", orgId);

  const profileById = Object.fromEntries(
    ((allProfiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );

  const customerIds = ((allProfiles ?? []) as ProfileRow[])
    .filter((p) => p.role === "customer")
    .map((p) => p.id);

  const { data: customerInfos } = customerIds.length
    ? await svc.from("customers_info").select("id, company_name").in("id", customerIds)
    : { data: [] as CustomerInfo[] };

  const companyById = Object.fromEntries(
    ((customerInfos ?? []) as CustomerInfo[]).map((c) => [c.id, c.company_name])
  );

  // ── Enrich tickets ─────────────────────────────────────────────────────────
  const enriched = tickets.map((ticket) => ({
    ...ticket,
    company_name: companyById[ticket.created_by] ?? null,
    creator_name: profileById[ticket.created_by]?.full_name ?? null,
    agent_name:   ticket.assigned_to
      ? (profileById[ticket.assigned_to]?.full_name ?? null)
      : null,
  }));

  // ── Build filter options ────────────────────────────────────────────────────
  const companies = [...new Set(
    enriched.map((t) => t.company_name).filter((c): c is string => !!c)
  )].sort();

  const agentMap = new Map<string, string>();
  enriched.forEach((t) => {
    if (t.assigned_to && t.agent_name) agentMap.set(t.assigned_to, t.agent_name);
  });
  const agents = Array.from(agentMap.entries()).map(([id, name]) => ({ id, name }));

  // ── Apply URL filters ───────────────────────────────────────────────────────
  const filtered = enriched
    .filter((t) => !filters.company  || t.company_name === filters.company)
    .filter((t) => !filters.priority || t.priority === filters.priority)
    .filter((t) => !filters.agent    || t.assigned_to === filters.agent);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-indigo-400" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {t("totalShowing", { count: filtered.length })}
            {(filters.company || filters.priority || filters.agent) && (
              <span className="text-indigo-400 ml-1">· filtered</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5">
        <AdminFilters companies={companies} agents={agents} />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("noTickets")}</p>
        </Card>
      ) : (
        <div className="rounded-xl border border-[var(--color-surface-600)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider w-24">
                  Ref
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  {t("company")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  {tck("priority")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden md:table-cell">
                  Summary
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
                  {t("assignedTo")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hidden xl:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-surface-700)]">
              {filtered.map((ticket) => {
                const ticketPath = locale === "de"
                  ? `/tickets/${ticket.id}`
                  : `/${locale}/tickets/${ticket.id}`;

                return (
                  <tr
                    key={ticket.id}
                    className={`relative hover:bg-[var(--color-surface-800)] transition-colors cursor-pointer ${
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

                    {/* Company of origin */}
                    <td className="px-4 py-3">
                      {ticket.company_name ? (
                        <span className="text-xs font-medium text-[var(--color-text-primary)]">
                          {ticket.company_name}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)] italic">
                          {t("internal")}
                        </span>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
                        {ticket.sla_breached && (
                          <Badge className="text-red-400 bg-red-400/10 border-red-400/20 text-[10px]">
                            SLA!
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3 hidden md:table-cell max-w-xs">
                      <span className="relative text-sm text-[var(--color-text-primary)] truncate block pointer-events-none">
                        {ticket.title}
                      </span>
                    </td>

                    {/* Assigned agent */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {ticket.agent_name ? (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {ticket.agent_name}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400 italic">
                          {t("unassigned")}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden xl:table-cell text-right">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {formatRelativeTime(ticket.created_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
