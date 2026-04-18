import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketComments } from "@/components/tickets/TicketComments";
import { AITriagePanel } from "@/components/ai/AITriagePanel";
import { TranslateButton } from "@/components/tickets/TranslateButton";
import { formatTicketRef, priorityColor, statusColor, formatRelativeTime } from "@/lib/utils";
import { Clock, Shield } from "lucide-react";

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

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", user.id).single();

  const isStaff = ["agent", "manager", "admin"].includes(profile?.role ?? "");

  // Flat ticket query — no embedded joins to avoid FK name mismatch errors.
  // PostgREST returns data=null (silently) when a join hint like
  // profiles!tickets_created_by_fkey doesn't match the actual constraint name.
  const { data: ticket, error: ticketError } = await svc
    .from("tickets")
    .select("*")
    .eq("id", id)
    .single();

  if (ticketError || !ticket) notFound();

  // Manual access check: customers can only see their own tickets
  if (!isStaff && ticket.created_by !== user.id) notFound();

  // Fetch related data as separate flat queries
  const [
    { data: category },
    { data: creator },
    { data: aiAnalysis },
    { data: comments },
  ] = await Promise.all([
    ticket.category_id
      ? svc.from("categories").select("name, slug, color, icon").eq("id", ticket.category_id).single()
      : Promise.resolve({ data: null }),
    svc.from("profiles").select("full_name, avatar_url").eq("id", ticket.created_by).single(),
    isStaff
      ? svc.from("ai_analysis").select("*").eq("ticket_id", id).single()
      : Promise.resolve({ data: null }),
    svc.from("ticket_comments")
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
            comments={comments ?? []}
            currentUserId={user.id}
            isStaff={isStaff}
            targetLocale={locale}
          />
        </div>

        <div className="space-y-4">
          {ticket.sla_resolution_due && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{t("slaDeadline")}</p>
                <p className={`text-sm font-medium ${ticket.sla_breached ? "text-red-400" : "text-[var(--color-text-primary)]"}`}>
                  {new Date(ticket.sla_resolution_due).toLocaleString(
                    locale === "de" ? "de-CH" : locale === "es" ? "es-ES" : "en-CH",
                    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                  )}
                </p>
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
