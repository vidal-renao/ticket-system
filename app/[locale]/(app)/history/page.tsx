import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Archive, CheckCircle2, History } from "lucide-react";
import { formatRelativeTime, formatTicketRef, priorityColor, statusColor } from "@/lib/utils";
import { matchesTicketQuery, ticketRefTokens } from "@/lib/ticket-search";
import { TicketSearch } from "@/components/tickets/TicketSearch";
import { UnarchiveButton } from "@/components/tickets/UnarchiveButton";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "History" };
}

type HistoryTicket = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_by: string;
  assigned_to: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id) redirect(loginPath);

  const isAdmin = profile.role === "admin";
  const isStaff = ["agent", "manager", "admin"].includes(profile.role);

  // History = finished work (resolved/closed), scoped per role. Archived
  // tickets only live here — they are excluded from every operational list.
  let query = svc
    .from("tickets")
    .select("id, ticket_number, title, status, priority, created_by, assigned_to, resolved_at, closed_at, archived_at, created_at")
    .eq("organization_id", profile.organization_id)
    .is("deleted_at", null)
    .in("status", ["resolved", "closed"])
    .order("archived_at", { ascending: false, nullsFirst: false })
    .order("resolved_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (profile.role === "customer") query = query.eq("created_by", user.id);
  if (profile.role === "agent") query = query.eq("assigned_to", user.id);

  const { data: rows } = await query;
  const allTickets = (rows ?? []) as HistoryTicket[];

  // Names for context (companies for staff, agents for everyone)
  const personIds = [
    ...new Set(
      allTickets.flatMap((t) => [t.created_by, t.assigned_to]).filter((v): v is string => Boolean(v))
    ),
  ];
  const [{ data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    personIds.length
      ? svc.from("profiles").select("id, full_name").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    personIds.length
      ? svc.from("customers_info").select("id, company_name").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
  ]);
  const nameById = Object.fromEntries(
    ((peopleRaw ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name])
  );
  const companyById = Object.fromEntries(
    ((companiesRaw ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name])
  );

  const tickets = allTickets.filter((ticket) =>
    matchesTicketQuery(q, [
      ...ticketRefTokens(ticket.ticket_number),
      ticket.title,
      companyById[ticket.created_by],
      nameById[ticket.created_by],
      ticket.assigned_to ? nameById[ticket.assigned_to] : null,
      ticket.status,
      ticket.priority,
    ])
  );

  const archivedCount = tickets.filter((t) => t.archived_at).length;
  const ticketBase = locale === "de" ? "/tickets" : `/${locale}/tickets`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <History className="h-5 w-5 text-indigo-400" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">History</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {profile.role === "customer"
            ? "Your resolved and closed tickets."
            : profile.role === "agent"
            ? "Finished work that was assigned to you."
            : "All finished tickets of the organization, including archived ones."}
        </p>
      </div>

      <TicketSearch className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Finished</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{tickets.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Archived</p>
            <Archive className="h-4 w-4 text-indigo-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{archivedCount}</p>
        </Card>
      </div>

      {tickets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <History className="mb-3 h-10 w-10 text-[var(--color-text-muted)]" />
          <p className="font-medium text-[var(--color-text-secondary)]">No finished tickets yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Resolved and closed tickets will appear here automatically.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const companyName = companyById[ticket.created_by] ?? nameById[ticket.created_by] ?? null;
            const agentName = ticket.assigned_to ? nameById[ticket.assigned_to] : null;
            const finishedAt = ticket.closed_at ?? ticket.resolved_at ?? ticket.created_at;
            return (
              <div
                key={ticket.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] px-4 py-3 transition-colors hover:border-indigo-500/30"
              >
                <Link href={`${ticketBase}/${ticket.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs text-indigo-400">
                    {formatTicketRef(ticket.ticket_number)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--color-text-primary)]">{ticket.title}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                      {isStaff && companyName ? `${companyName} · ` : ""}
                      {agentName ? `Agent: ${agentName} · ` : ""}
                      Finished {formatRelativeTime(finishedAt)}
                    </p>
                  </div>
                </Link>
                <Badge className={`hidden sm:inline-flex ${priorityColor(ticket.priority)}`}>{ticket.priority}</Badge>
                <Badge className={statusColor(ticket.status)}>{ticket.status}</Badge>
                {ticket.archived_at && (
                  <Badge className="border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                    <Archive className="h-3 w-3" /> Archived
                  </Badge>
                )}
                {isAdmin && ticket.archived_at && <UnarchiveButton ticketId={ticket.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
