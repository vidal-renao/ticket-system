import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MessageSquare, Lock, Building2, UserCircle2 } from "lucide-react";
import { formatRelativeTime, formatTicketRef, statusColor } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

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

  // ── Fetch recent comments ──────────────────────────────────────────────────
  // For customers: only their own tickets
  // For staff: all org tickets (excluding internal notes for display grouping)
  let comments: CommentRow[] = [];

  if (isStaff && orgId) {
    // Fetch all tickets in org first (need ticket IDs for comment filter)
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
        .limit(100);
      comments = (data ?? []) as CommentRow[];
    }
  } else {
    // Customer: only their own tickets
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
        .eq("is_internal", false) // customers never see internal notes
        .order("created_at", { ascending: false })
        .limit(100);
      comments = (data ?? []) as CommentRow[];
    }
  }

  // ── Get unique ticket + author IDs ─────────────────────────────────────────
  const uniqueTicketIds = [...new Set(comments.map((c) => c.ticket_id))];
  const uniqueAuthorIds = [...new Set(comments.map((c) => c.author_id))];

  const [
    { data: ticketsRaw },
    { data: profilesRaw },
  ] = await Promise.all([
    uniqueTicketIds.length
      ? svc
          .from("tickets")
          .select("id, ticket_number, title, status, created_by, organization_id")
          .in("id", uniqueTicketIds)
      : Promise.resolve({ data: [] as TicketRow[] }),
    uniqueAuthorIds.length
      ? svc
          .from("profiles")
          .select("id, full_name, role")
          .in("id", uniqueAuthorIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);

  const tickets = (ticketsRaw ?? []) as TicketRow[];
  const authors = (profilesRaw ?? []) as ProfileRow[];

  // Fetch company names for customer authors
  const customerAuthorIds = authors
    .filter((p) => p.role === "customer")
    .map((p) => p.id);

  const { data: customerInfosRaw } = customerAuthorIds.length
    ? await svc
        .from("customers_info")
        .select("id, company_name")
        .in("id", customerAuthorIds)
    : { data: [] as CustomerInfo[] };

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const ticketById = Object.fromEntries(tickets.map((t) => [t.id, t]));
  const authorById = Object.fromEntries(authors.map((p) => [p.id, p]));
  const companyById = Object.fromEntries(
    ((customerInfosRaw ?? []) as CustomerInfo[]).map((c) => [c.id, c.company_name])
  );

  // ── Group comments by ticket (latest first per ticket) ────────────────────
  const seen = new Set<string>();
  const grouped: Array<{
    ticket: TicketRow;
    comment: CommentRow;
    authorName: string;
    isCustomerMessage: boolean;
    companyName: string | null;
  }> = [];

  for (const comment of comments) {
    if (seen.has(comment.ticket_id)) continue;
    seen.add(comment.ticket_id);
    const ticket = ticketById[comment.ticket_id];
    if (!ticket) continue;
    const author = authorById[comment.author_id];
    const authorName = author?.full_name ?? "Unknown";
    const isCustomerMessage = author?.role === "customer";
    const companyName = isCustomerMessage ? (companyById[comment.author_id] ?? null) : null;
    grouped.push({ ticket, comment, authorName, isCustomerMessage, companyName });
  }

  const ticketPath = (id: string) =>
    locale === "de" ? `/tickets/${id}` : `/${locale}/tickets/${id}`;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-indigo-400" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Inbox</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {isStaff ? "Recent activity across all tickets" : "Messages on your tickets"}
        </p>
      </div>

      {grouped.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">No messages yet.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {isStaff ? "Comments on org tickets will appear here." : "Replies to your tickets will appear here."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ ticket, comment, authorName, isCustomerMessage, companyName }) => (
            <Link
              key={comment.id}
              href={ticketPath(ticket.id)}
              className="block rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] hover:border-indigo-500/30 hover:bg-[var(--color-surface-800)] transition-all group"
            >
              <div className="px-4 py-3.5">
                {/* Ticket ref + status */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[11px] text-indigo-400">
                    {formatTicketRef(ticket.ticket_number)}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0.5 ${statusColor(ticket.status)}`}>
                    {ticket.status.replace("_", " ")}
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

                {/* Ticket title */}
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate mb-1.5 group-hover:text-indigo-300 transition-colors">
                  {ticket.title}
                </p>

                {/* Author + message preview */}
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
