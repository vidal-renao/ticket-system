import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketComments } from "@/components/tickets/TicketComments";
import { AITriagePanel } from "@/components/ai/AITriagePanel";
import {
  formatTicketRef,
  priorityColor,
  statusColor,
  formatRelativeTime,
  sentimentIcon,
} from "@/lib/utils";
import { Clock, Shield } from "lucide-react";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: ticket } = await supabase
    .from("tickets")
    .select(`
      *,
      categories(name, slug, color, icon),
      profiles!tickets_created_by_fkey(full_name, avatar_url),
      ai_analysis(*)
    `)
    .eq("id", id)
    .single();

  if (!ticket) notFound();

  const { data: comments } = await supabase
    .from("ticket_comments")
    .select(`*, profiles(full_name, avatar_url)`)
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  const isStaff = ["agent", "manager", "admin"].includes(profile?.role ?? "");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            {formatTicketRef(ticket.ticket_number)}
          </span>
          {ticket.contains_pii && isStaff && (
            <Badge className="text-amber-400 bg-amber-400/10 border-amber-400/20">
              <Shield className="w-3 h-3" /> PII
            </Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-3">
          {ticket.title}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={priorityColor(ticket.priority)}>{ticket.priority}</Badge>
          <Badge className={statusColor(ticket.status)}>{ticket.status.replace(/_/g, " ")}</Badge>
          {ticket.categories && (
            <Badge className="text-[var(--color-text-secondary)] border-[var(--color-surface-600)]">
              {ticket.categories.name}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(ticket.created_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">Description</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
            </CardContent>
          </Card>

          {/* Comments */}
          <TicketComments
            ticketId={ticket.id}
            comments={comments ?? []}
            currentUserId={user.id}
            isStaff={isStaff}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* SLA Card */}
          {ticket.sla_resolution_due && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">SLA Deadline</p>
                <p className={`text-sm font-medium ${ticket.sla_breached ? "text-red-400" : "text-[var(--color-text-primary)]"}`}>
                  {new Date(ticket.sla_resolution_due).toLocaleString("en-CH", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {ticket.sla_breached && (
                  <p className="text-xs text-red-400 mt-1">SLA breached</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI Triage Panel — agents/managers only */}
          {isStaff && ticket.ai_analysis && (
            <AITriagePanel analysis={ticket.ai_analysis} ticketId={ticket.id} />
          )}

          {/* AI pending state */}
          {isStaff && !ticket.ai_analysis && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">AI Triage</p>
                <p className="text-xs text-[var(--color-text-muted)]">Processing...</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
