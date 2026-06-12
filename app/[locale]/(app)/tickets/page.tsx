import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentUserContext, isAdmin, isCustomer, isEmployee } from "@/lib/auth/permissions";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t  = await getTranslations("tickets");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const ctx = await getCurrentUserContext();
  if (!ctx) redirect(loginPath);

  const svc = createServiceClientStatic();
  const isStaff = isAdmin(ctx) || isEmployee(ctx);
  const customer = isCustomer(ctx);
  const orgId = ctx.organizationId ?? "00000000-0000-0000-0000-000000000000";

  // ── Customer query: full columns ─────────────────────────────────────────
  type CustomerTicket = {
    id: string;
    ticket_number: number;
    title: string;
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
    status: string;
    priority: string;
    created_at: string;
    updated_at: string;
  };

  const { data: tickets, error } = isAdmin(ctx)
    ? await svc
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, updated_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100)
    : isEmployee(ctx)
      ? await svc
          .from("tickets")
          .select("id, ticket_number, title, status, priority, created_at, updated_at")
          .eq("organization_id", orgId)
          .or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`)
          .order("created_at", { ascending: false })
          .limit(100)
      : await svc
          .from("tickets")
          .select("id, ticket_number, title, status, priority, created_at, resolved_at")
          .eq("created_by", ctx.userId)
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {customer ? t("myTickets") : t("allTickets")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {t("totalCount", { count: tickets?.length ?? 0 })}
          </p>
        </div>
        {customer && (
          <Link href={newTicketPath}>
            <Button size="sm">
              <PlusCircle className="w-4 h-4" />
              {t("newTicket")}
            </Button>
          </Link>
        )}
      </div>

      {!tickets || tickets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">{t("noTickets")}</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {customer ? t("noTicketsCustomer") : t("noTicketsStaff")}
          </p>
          {customer && (
            <Link href={newTicketPath} className="mt-4">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> {t("newTicket")}
              </Button>
            </Link>
          )}
        </Card>
      ) : customer ? (
        /* ── Customer: detailed timeline table ─────────────────────────────── */
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
              {(tickets as CustomerTicket[]).map((ticket) => {
                const ticketPath = locale === "de"
                  ? `/tickets/${ticket.id}`
                  : `/${locale}/tickets/${ticket.id}`;

                const aiCategory = aiCategoryMap[ticket.id] ?? null;
                const resolved   = isResolved(ticket.status);
                const active     = isActive(ticket.status);

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
                        className="text-sm text-[var(--color-text-primary)] hover:text-indigo-300 transition-colors truncate block"
                      >
                        {ticket.title}
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
      ) : (
        /* ── Staff: card list view ── */
        <ol role="list" aria-label="Tickets" className="space-y-2">
          {(tickets as StaffTicket[]).map((ticket) => {
            const ticketPath = locale === "de"
              ? `/tickets/${ticket.id}`
              : `/${locale}/tickets/${ticket.id}`;
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <PriorityBadge priority={ticket.priority} label={tp(ticket.priority)} />
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
