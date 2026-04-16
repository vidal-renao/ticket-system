import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TicketIcon, PlusCircle, Clock, AlertCircle, Zap } from "lucide-react";
import { formatTicketRef, priorityColor, statusColor, formatRelativeTime } from "@/lib/utils";

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
  const t = await getTranslations("tickets");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const query = supabase
    .from("tickets")
    .select(`
      id, ticket_number, title, status, priority, created_at, updated_at,
      categories(name, slug, color, icon),
      profiles!tickets_created_by_fkey(full_name),
      ai_analysis(suggested_priority, confidence_score, sentiment)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (profile?.role === "customer") {
    query.eq("created_by", user.id);
  } else {
    query.eq("organization_id", profile?.organization_id ?? "");
  }

  const { data: tickets } = await query;
  const newTicketPath = locale === "de" ? "/tickets/new" : `/${locale}/tickets/new`;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {profile?.role === "customer" ? t("myTickets") : t("allTickets")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {t("totalCount", { count: tickets?.length ?? 0 })}
          </p>
        </div>
        {profile?.role === "customer" && (
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
            {profile?.role === "customer" ? t("noTicketsCustomer") : t("noTicketsStaff")}
          </p>
          {profile?.role === "customer" && (
            <Link href={newTicketPath} className="mt-4">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> {t("newTicket")}
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <ol role="list" aria-label="Tickets" className="space-y-2">
          {tickets.map((ticket: any) => {
            const ticketPath = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
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
                      {ticket.ai_analysis &&
                        (ticket.ai_analysis.confidence_score ?? 0) >= 60 &&
                        ticket.ai_analysis.suggested_priority !== ticket.priority && (
                        <span
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
                          title={`AI suggests: ${ticket.ai_analysis.suggested_priority} (${ticket.ai_analysis.confidence_score?.toFixed(0)}% conf.)`}
                        >
                          <Zap className="w-2.5 h-2.5" />
                          {tp(ticket.ai_analysis.suggested_priority as any)}
                        </span>
                      )}
                      <Badge className={priorityColor(ticket.priority)}>
                        {tp(ticket.priority)}
                      </Badge>
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
