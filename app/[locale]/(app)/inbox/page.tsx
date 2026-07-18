import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MessageSquare, Lock, Building2, UserCircle2, Send, Bell, Clock } from "lucide-react";
import { formatRelativeTime, formatTicketRef, statusColor } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { InboxMarkReadTrigger } from "./InboxMarkReadTrigger";
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
  const { tab = "all" } = await searchParams;

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
    const { data: orgTickets } = await svc
      .from("tickets")
      .select("id")
      .eq("organization_id", orgId);
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
      .eq("created_by", user.id);
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
      ? svc.from("tickets").select("id, ticket_number, title, status, created_by, organization_id").in("id", uniqueTicketIds)
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
  // "all"     — latest per ticket (same as before)
  // "unread"  — tickets with customer messages (staff) or staff messages (customer) not yet read
  // "sent"    — messages authored by current user
  // "pending" — tickets in pending_customer status (staff) / open tickets waiting on staff (customer)

  function getFiltered(): EnrichedComment[] {
    if (tab === "sent") {
      return enriched.filter((e) => e.isMyMessage);
    }
    if (tab === "pending") {
      const pending = isStaff
        ? enriched.filter((e) => WAITING_TICKET_STATUSES.includes(e.ticket.status as (typeof WAITING_TICKET_STATUSES)[number]))
        : enriched.filter((e) => ["open", "in_progress"].includes(e.ticket.status));
      // de-dupe by ticket
      const seen = new Set<string>();
      return pending.filter((e) => {
        if (seen.has(e.ticket.id)) return false;
        seen.add(e.ticket.id);
        return true;
      });
    }
    if (tab === "unread") {
      const unread = isStaff
        ? enriched.filter((e) => e.isCustomerMessage)
        : enriched.filter((e) => !e.isCustomerMessage);
      const seen = new Set<string>();
      return unread.filter((e) => {
        if (seen.has(e.ticket.id)) return false;
        seen.add(e.ticket.id);
        return true;
      });
    }
    // "all" — one per ticket (latest)
    const seen = new Set<string>();
    return enriched.filter((e) => {
      if (seen.has(e.ticket.id)) return false;
      seen.add(e.ticket.id);
      return true;
    });
  }

  const filtered = getFiltered();
  const inboxPath = locale === "de" ? "/inbox" : `/${locale}/inbox`;

  const TABS = [
    { key: "all",     label: "All",     icon: MessageSquare },
    { key: "unread",  label: isStaff ? "Customer Messages" : "Staff Replies", icon: Bell },
    { key: "sent",    label: "Sent",    icon: Send },
    { key: "pending", label: "Pending", icon: Clock },
  ];

  const ticketPath = (id: string) =>
    locale === "de" ? `/tickets/${id}` : `/${locale}/tickets/${id}`;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <InboxMarkReadTrigger />
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
        {TABS.map(({ key, label, icon: Icon }) => (
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
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">No messages here.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {tab === "pending" ? "No tickets waiting for a response." :
             tab === "sent"    ? "You haven't sent any messages yet." :
             tab === "unread"  ? "All caught up!" :
             isStaff ? "Comments on org tickets will appear here." : "Replies to your tickets will appear here."}
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
