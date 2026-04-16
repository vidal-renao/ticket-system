import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, Clock, Zap, Shield } from "lucide-react";
import { formatTicketRef, priorityColor, sentimentIcon, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Queue" };

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function QueuePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["agent", "manager", "admin"].includes(profile.role)) {
    redirect("/tickets");
  }

  const { data: tickets } = await supabase
    .from("tickets")
    .select(`
      id, ticket_number, title, status, priority, created_at, sla_breached,
      sla_resolution_due, contains_pii,
      categories(name, slug),
      profiles!tickets_created_by_fkey(full_name),
      ai_analysis(suggested_priority, sentiment, confidence_score, summary)
    `)
    .eq("organization_id", profile.organization_id ?? "")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  // Sort: SLA breached first, then by priority
  const sorted = [...(tickets ?? [])].sort((a: any, b: any) => {
    if (a.sla_breached && !b.sla_breached) return -1;
    if (!a.sla_breached && b.sla_breached) return 1;
    return (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3) -
           (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3);
  });

  const critical = sorted.filter((t: any) => t.priority === "critical" || t.sla_breached);
  const regular  = sorted.filter((t: any) => t.priority !== "critical" && !t.sla_breached);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Queue</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {sorted.length} open · {critical.length} urgent
          </p>
        </div>
      </div>

      {/* Critical / Breached */}
      {critical.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
              Urgent / SLA Breached
            </h2>
          </div>
          <div className="space-y-2">
            {critical.map((t: any) => <TicketRow key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {/* Regular queue */}
      <div className="space-y-2">
        {regular.map((t: any) => <TicketRow key={t.id} ticket={t} />)}
      </div>

      {sorted.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">Queue is clear</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">No open tickets right now.</p>
        </Card>
      )}
    </div>
  );
}

function TicketRow({ ticket }: { ticket: any }) {
  return (
    <Link href={`/tickets/${ticket.id}`}>
      <Card hover className="p-4">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            <AlertCircle className={`w-4 h-4 ${
              ticket.priority === "critical" ? "text-red-400" :
              ticket.priority === "high"     ? "text-orange-400" :
              ticket.priority === "medium"   ? "text-yellow-400" : "text-green-400"
            }`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[var(--color-text-muted)]">
                {formatTicketRef(ticket.ticket_number)}
              </span>
              {ticket.categories && (
                <span className="text-xs text-[var(--color-text-muted)]">· {ticket.categories.name}</span>
              )}
              {ticket.contains_pii && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                  <Shield className="w-2.5 h-2.5" /> PII
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate mb-1">
              {ticket.title}
            </p>
            {ticket.ai_analysis?.summary && (
              <p className="text-xs text-[var(--color-text-muted)] truncate">
                {ticket.ai_analysis.summary}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {ticket.ai_analysis?.sentiment && (
              <span className="text-base" title={ticket.ai_analysis.sentiment}>
                {sentimentIcon(ticket.ai_analysis.sentiment)}
              </span>
            )}
            {ticket.sla_breached && (
              <Badge className="text-red-400 bg-red-400/10 border-red-400/20">SLA!</Badge>
            )}
            <Badge className={priorityColor(ticket.priority)}>{ticket.priority}</Badge>
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(ticket.created_at)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
