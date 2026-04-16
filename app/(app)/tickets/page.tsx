import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TicketIcon, PlusCircle, Clock, AlertCircle } from "lucide-react";
import { formatTicketRef, priorityColor, statusColor, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Tickets" };

export default async function TicketsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  // Customers see only their tickets; agents/managers see all in org
  const query = supabase
    .from("tickets")
    .select(`
      id, ticket_number, title, status, priority, created_at, updated_at,
      categories(name, slug, color, icon),
      profiles!tickets_created_by_fkey(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (profile?.role === "customer") {
    query.eq("created_by", user.id);
  } else {
    query.eq("organization_id", profile?.organization_id ?? "");
  }

  const { data: tickets } = await query;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {profile?.role === "customer" ? "My Tickets" : "All Tickets"}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {tickets?.length ?? 0} tickets total
          </p>
        </div>
        {profile?.role === "customer" && (
          <Link href="/tickets/new">
            <Button size="sm">
              <PlusCircle className="w-4 h-4" />
              New Ticket
            </Button>
          </Link>
        )}
      </div>

      {/* Ticket list */}
      {!tickets || tickets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <TicketIcon className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-[var(--color-text-secondary)] font-medium">No tickets yet</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {profile?.role === "customer" ? "Submit your first support request." : "No tickets in your organization."}
          </p>
          {profile?.role === "customer" && (
            <Link href="/tickets/new" className="mt-4">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> New Ticket
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket: any) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
              <Card hover className="p-4">
                <div className="flex items-start gap-4">
                  {/* Priority indicator */}
                  <div className="mt-0.5">
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
                        <span className="text-xs text-[var(--color-text-muted)]">
                          · {ticket.categories.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {ticket.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={priorityColor(ticket.priority)}>
                      {ticket.priority}
                    </Badge>
                    <Badge className={statusColor(ticket.status)}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(ticket.updated_at)}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
