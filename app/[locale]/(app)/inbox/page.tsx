import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MessageSquare, Lock, Building2, UserCircle2, Send, Inbox as InboxIcon, MailOpen, Clock } from "lucide-react";
import { formatRelativeTime, formatTicketRef, statusColor } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { WAITING_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Inbox" };
}

interface CommentRow {
  id: string;
  content: string;
  is_internal: boolean;
  is_ai_generated: boolean;
  created_at: string;
  ticket_id: string;
  author_id: string;
}

interface TicketRow {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  created_by: string;
  organization_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string;
}

interface CustomerInfo {
  id: string;
  company_name: string;
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab = "inbox" } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect(loginPath);

  const isStaff = ["agent", "manager", "admin"].includes(profile.role);
  const orgId = profile.organization_id as string | null;

  // ── Fetch comments ──────────────────────────────────────────────────────────
  let allComments: CommentRow[] = [];

  if (isStaff && orgId) {
    let visibleTickets = svc
      .from("tickets")
      .select("id")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    if (profile.role === "agent") visibleTickets = visibleTickets.eq("assigned_to", user.id);
    const { data: orgTickets } = await visibleTickets;
    const ticketIds = (orgTickets ?? []).map((t: { id: string }) => t.id);

    if (ticketIds.length > 0) {
      const { data } = await svc
        .from("ticket_comments")
        .select("id, content, is_internal, is_ai_generated, created_at, ticket_id, author_id")
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: false })
        .limit(200);
      allComments = (data ?? []) as CommentRow[];
    }
  } else {
    const { data: myTickets } = await svc
      .from("tickets")
      .select("id")
      .eq("created_by", user.id)
      .is("deleted_at", null);
    const ticketIds = (myTickets ?? []).map((t: { id: string }) => t.id);

    if (ticketIds.length > 0) {
      const { data } = await svc
        .from("ticket_comments")
        .select("id, content, is_internal, is_ai_generated, created_at, ticket_id, author_id")
        .in("ticket_id", ticketIds)
        .eq("is_internal", false)
        .order("created_at", { ascending: false })
        .limit(200);
      allComments = (data ?? []) as CommentRow[];
    }
  }

  // ── Build lookup maps ───────────────────────────────────────────────────────
  const uniqueTicketIds = [...new Set(allComments.map((c) => c.ticket_id))];
  const uniqueAuthorIds = [...new Set(allComments.map((c) => c.author_id))];

  const [{ data: ticketsRaw }, { data: profilesRaw }] = await Promise.all([
    uniqueTicketIds.length
      ? svc.from("tickets").select("id, ticket_number, title, status, created_by, organization_id").eq("organization_id", orgId).in("id", uniqueTicketIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as TicketRow[] }),
    uniqueAuthorIds.length
      ? svc.from("profiles").select("id, full_name, role").in("id", uniqueAuthorIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);

  const tickets = (ticketsRaw ?? []) as TicketRow[];
  const authors = (profilesRaw ?? []) as ProfileRow[];

  const customerAuthorIds = authors.filter((p) => p.role === "customer").map((p) => p.id);
  const { data: customerInfosRaw } = customerAuthorIds.length
    ? await svc.from("customers_info").select("id, company_name").in("id", customerAuthorIds)
    : { data: [] as CustomerInfo[] };

  // True "to read" state: comment notifications the user has not read yet.
  // They are marked read when the user opens the ticket, not the inbox.
  const { data: unreadNotifRows } = await svc
    .from("notifications")
    .select("ticket_id")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .eq("type", "comment.public");
  const unreadTicketIds = new Set(
    ((unreadNotifRows ?? []) as { ticket_id: string | null }[])
      .map((n) => n.ticket_id)
      .filter((v): v is string => Boolean(v))
  );

  const ticketById = Object.fromEntries(tickets.map((t) => [t.id, t]));
  const authorById = Object.fromEntries(authors.map((p) => [p.id, p]));
  const companyById = Object.fromEntries(
    ((customerInfosRaw ?? []) as CustomerInfo[]).map((c) => [c.id, c.company_name])
  );

  // ── Build enriched comment list ─────────────────────────────────────────────
  type EnrichedComment = {
    comment: CommentRow;
    ticket: TicketRow;
    authorName: string;
    authorRole: string;
    isCustomerMessage: boolean;
    companyName: string | null;
    isMyMessage: boolean;
  };

  const enriched: EnrichedComment[] = [];
  for (const comment of allComments) {
    const ticket = ticketById[comment.ticket_id];
    if (!ticket) continue;
    const author = authorById[comment.author_id];
    enriched.push({
      comment,
      ticket,
      authorName: author?.full_name ?? "Unknown",
      authorRole: author?.role ?? "unknown",
      isCustomerMessage: author?.role === "customer",
      companyName: author?.role === "customer" ? (companyById[comment.author_id] ?? null) : null,
      isMyMessage: comment.author_id === user.id,
    });
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  // "inbox"   — messages received from others, latest per ticket
  // "toread"  — received messages you have not read yet (unread notifications)
  // "outbox"  — messages you sent
  // "waiting" — tickets currently waiting on someone

  function dedupeByTicket(list: EnrichedComment[]): EnrichedComment[] {
    const seen = new Set<string>();
    return list.filter((e) => {
      if (seen.has(e.ticket.id)) return false;
      seen.add(e.ticket.id);
      return true;
    });
  }

  const received = enriched.filter((e) => !e.isMyMessage);
  const toReadList = dedupeByTicket(received.filter((e) => unreadTicketIds.has(e.ticket.id)));

  function getFiltered(): EnrichedComment[] {
    if (tab === "outbox") {
      return enriched.filter((e) => e.isMyMessage);
    }
    if (tab === "toread") {
      return toReadList;
    }
    if (tab === "waiting") {
      const pending = isStaff
        ? enriched.filter((e) => WAITING_TICKET_STATUSES.includes(e.ticket.status as (typeof WAITING_TICKET_STATUSES)[number]))
        : enriched.filter((e) => ["open", "in_progress"].includes(e.ticket.status));
      return dedupeByTicket(pending);
    }
    // "inbox" — received messages, one per ticket (latest)
    return dedupeByTicket(received);
  }

  const filtered = getFiltered();
  const inboxPath = locale === "de" ? "/inbox" : `/${locale}/inbox`;

  const TABS = [
    { key: "inbox",   label: "Inbox",   icon: InboxIcon, count: null },
    { key: "toread",  label: "To read", icon: MailOpen,  count: toReadList.length },
    { key: "outbox",  label: "Outbox",  icon: Send,      count: null },
    { key: "waiting", label: "Waiting", icon: Clock,     count: null },
  ];

  const ticketPath = (id: string) =>
    locale === "de" ? `/tickets/${id}` : `/${locale}/tickets/${id}`;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-indigo-400" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Inbox</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {isStaff ? "Recent activity across all tickets" : "Messages on your tickets"}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-5 p-1 bg-[var(--color-surface-800)] rounded-xl border border-[var(--color-surface-700)]">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <Link
            key={key}
            href={`${inboxPath}?tab=${key}`}
            className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === key
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {typeof count === "number" && count > 0 && (
              <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                tab === key ? "bg-white/20 text-white" : "bg-indigo-500 text-white"
              }`}>
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">No messages here.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {tab === "waiting" ? "No tickets waiting for a response." :
             tab === "outbox"  ? "You haven't sent any messages yet." :
             tab === "toread"  ? "All caught up — nothing left to read!" :
             isStaff ? "Messages you receive on org tickets will appear here." : "Replies to your tickets will appear here."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ ticket, comment, authorName, isCustomerMessage, companyName }) => (
            <Link
              key={comment.id}
              href={ticketPath(ticket.id)}
              className="block rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] hover:border-indigo-500/30 hover:bg-[var(--color-surface-800)] transition-all group"
            >
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[11px] text-indigo-400">
                    {formatTicketRef(ticket.ticket_number)}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0.5 ${statusColor(ticket.status)}`}>
                    {ticket.status.replace(/_/g, " ")}
                  </Badge>
                  {comment.is_internal && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <Lock className="w-2.5 h-2.5" /> Internal
                    </span>
                  )}
                  {comment.is_ai_generated && (
                    <span className="text-[10px] text-indigo-400">AI</span>
                  )}
                  <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>

                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate mb-1.5 group-hover:text-indigo-300 transition-colors">
                  {ticket.title}
                </p>

                <div className="flex items-start gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${
                    isCustomerMessage
                      ? "bg-amber-600/20 text-amber-400"
                      : "bg-indigo-600/20 text-indigo-400"
                  }`}>
                    {authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isCustomerMessage ? (
                        <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
                      ) : (
                        <UserCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        {companyName ?? authorName}
                      </span>
                      {companyName && (
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          · {authorName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
