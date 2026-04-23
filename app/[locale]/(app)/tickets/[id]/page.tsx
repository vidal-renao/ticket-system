import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import { applyTicketVisibilityScope } from "@/lib/ticket-visibility";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketComments } from "@/components/tickets/TicketComments";
import { AITriagePanel } from "@/components/ai/AITriagePanel";
import { TranslateButton } from "@/components/tickets/TranslateButton";
import { formatTicketRef, priorityColor, statusColor, formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, Clock, Shield } from "lucide-react";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t  = await getTranslations("ticket");
  const tp = await getTranslations("priority");
  const ts = await getTranslations("status");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);
  const currentUserId = user?.id ?? "";

  const profile = await getCurrentProfile(supabase, currentUserId);
  if (!profile?.organization_id) notFound();

  const isStaff = isStaffRole(profile?.role);

  // Flat ticket query — no embedded joins to avoid FK name mismatch errors.
  // PostgREST returns data=null (silently) when a join hint like
  // profiles!tickets_created_by_fkey doesn't match the actual constraint name.
  const { data: ticket, error: ticketError } = await applyTicketVisibilityScope(
    supabase.from("tickets").select("*").eq("id", id),
    profile
  ).single();

  if (ticketError || !ticket) notFound();

  const slaStatus = getSlaStatus(ticket);
  const responseDueAt = ticket.response_due_at ?? ticket.sla_first_response_due;
  const resolutionDueAt = ticket.resolution_due_at ?? ticket.sla_resolution_due;

  // Fetch related data as separate flat queries
  const [
    { data: category },
    { data: creator },
    { data: aiAnalysis },
    { data: comments },
  ] = await Promise.all([
    ticket.category_id
      ? supabase.from("categories").select("name, slug, color, icon").eq("id", ticket.category_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", ticket.created_by).single(),
    isStaff
      ? supabase.from("ai_analysis").select("*").eq("ticket_id", id).single()
      : Promise.resolve({ data: null }),
    supabase.from("ticket_comments")
      .select("*, profiles(full_name, avatar_url)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            {formatTicketRef(ticket.ticket_number)}
          </span>
          {ticket.contains_pii && isStaff && (
            <Badge className="text-amber-400 bg-amber-400/10 border-amber-400/20">
              <Shield className="w-3 h-3" /> {t("piiWarning")}
            </Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-3">
          {ticket.title}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={priorityColor(ticket.priority)}>{tp(ticket.priority)}</Badge>
          <Badge className={statusColor(ticket.status)}>{ts(ticket.status)}</Badge>
          {category && (
            <Badge className="text-[var(--color-text-secondary)] border-[var(--color-surface-600)]">
              {category.name}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(ticket.created_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t("description" as any) ?? "Description"}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
              {ticket.description && (
                <TranslateButton
                  text={ticket.description}
                  targetLocale={locale}
                  className="mt-3"
                />
              )}
            </CardContent>
          </Card>

          <TicketComments
            ticketId={ticket.id}
            currentStatus={ticket.status}
            comments={comments ?? []}
            currentUserId={currentUserId}
            isStaff={isStaff}
            targetLocale={locale}
          />
        </div>

        <div className="space-y-4">
          {(responseDueAt || resolutionDueAt) && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">{t("slaDeadline")}</p>
                  {slaStatus && (
                    <Badge className={slaStatus.className}>
                      {slaStatus.icon}
                      {slaStatus.label}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {responseDueAt && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Response:{" "}
                      <span className="text-[var(--color-text-primary)]">
                        {new Date(responseDueAt).toLocaleString(
                          locale === "de" ? "de-CH" : locale === "es" ? "es-ES" : "en-CH",
                          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                        )}
                      </span>
                    </p>
                  )}
                  {resolutionDueAt && (
                    <p className={`text-xs ${ticket.sla_breached ? "text-red-400" : "text-[var(--color-text-muted)]"}`}>
                      Resolution:{" "}
                      <span className={ticket.sla_breached ? "text-red-400" : "text-[var(--color-text-primary)]"}>
                        {new Date(resolutionDueAt).toLocaleString(
                          locale === "de" ? "de-CH" : locale === "es" ? "es-ES" : "en-CH",
                          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                        )}
                      </span>
                    </p>
                  )}
                </div>
                {ticket.sla_breached && (
                  <p className="text-xs text-red-400 mt-1">{t("slaBreached")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {isStaff && aiAnalysis && (
            <AITriagePanel analysis={aiAnalysis} ticketId={ticket.id} />
          )}

          {isStaff && !aiAnalysis && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">{t("aiTriage")}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{t("aiProcessing")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function getSlaStatus(ticket: {
  created_at: string;
  status: string;
  resolved_at: string | null;
  sla_breached?: boolean | null;
  sla_response_breached?: boolean | null;
  sla_resolution_breached?: boolean | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  first_response_at?: string | null;
  first_agent_response_at?: string | null;
}) {
  const now = Date.now();
  const firstResponseAt = ticket.first_agent_response_at ?? ticket.first_response_at;
  const responseDue = ticket.response_due_at ?? ticket.sla_first_response_due;
  const resolutionDue = ticket.resolution_due_at ?? ticket.sla_resolution_due;
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  const responseBreached = Boolean(
    responseDue &&
      !firstResponseAt &&
      now > new Date(responseDue).getTime()
  );
  const resolutionBreached = Boolean(
    resolutionDue &&
      !isResolved &&
      now > new Date(resolutionDue).getTime()
  );

  if (ticket.sla_breached || ticket.sla_response_breached || ticket.sla_resolution_breached || responseBreached || resolutionBreached) {
    return {
      label: "Breached",
      icon: <AlertTriangle className="w-3 h-3" />,
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    };
  }

  const activeDueDates = [!firstResponseAt ? responseDue : null, !isResolved ? resolutionDue : null]
    .filter(Boolean)
    .map((date) => new Date(date as string).getTime());

  if (activeDueDates.length === 0) {
    return {
      label: "On time",
      icon: <Clock className="w-3 h-3" />,
      className: "text-green-400 bg-green-400/10 border-green-400/20",
    };
  }

  const nextDue = Math.min(...activeDueDates);
  const totalWindow = nextDue - new Date(ticket.created_at).getTime();
  const remaining = nextDue - now;
  const oneHour = 60 * 60 * 1000;

  if (remaining <= oneHour || (totalWindow > 0 && remaining / totalWindow <= 0.25)) {
    return {
      label: "At risk",
      icon: <AlertTriangle className="w-3 h-3" />,
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    };
  }

  return {
    label: "On time",
    icon: <Clock className="w-3 h-3" />,
    className: "text-green-400 bg-green-400/10 border-green-400/20",
  };
}
