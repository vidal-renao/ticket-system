import { forbidden, notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import { formatAgentIdentity, getInitials, resolveTicketAccess } from "@/lib/ticket-visibility";
import type { Database } from "@/lib/supabase/types";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketComments } from "@/components/tickets/TicketComments";
import { AITriagePanel } from "@/components/ai/AITriagePanel";
import { ReanalyzeButton } from "@/components/tickets/ReanalyzeButton";
import { TranslateButton } from "@/components/tickets/TranslateButton";
import { SlaCountdown } from "@/components/tickets/SlaCountdown";
import { CustomerResolutionActions } from "@/components/tickets/CustomerResolutionActions";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { TicketAssigneeSelect } from "@/components/tickets/TicketAssigneeSelect";
import { effectivePresence } from "@/lib/presence";
import { sortAgentOptions, type AgentOption } from "@/lib/agent-options";
import { getLastSeenMap } from "@/lib/presence-server";
import { formatTicketRef, priorityColor, statusColor, formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, Clock, Shield } from "lucide-react";
import { AISupportChat } from "@/components/tickets/AISupportChat";
import { TicketWorkflowActions } from "@/components/tickets/TicketWorkflowActions";
import { AdminForceCloseAction } from "@/components/tickets/AdminForceCloseAction";

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
  const svc = createServiceClientStatic();

  const profile = await getCurrentProfile(svc, currentUserId);
  if (!profile?.organization_id) {
    console.error("[TicketDetailPage] Missing profile organization", {
      ticketId: id,
      userId: currentUserId,
      roleHint: "ticket-detail",
    });
    redirect(loginPath);
  }

  const isStaff = isStaffRole(profile?.role);

  const access = await resolveTicketAccess<Database["public"]["Tables"]["hd_tickets"]["Row"]>(
    svc,
    profile,
    id,
    "*"
  );

  if (access.kind === "not_found") notFound();
  if (access.kind === "forbidden") forbidden();

  const ticket = access.ticket;

  // Opening a ticket is what marks its notifications as read for this user —
  // the inbox "To read" tab stays accurate until each conversation is opened.
  await svc
    .from("hd_notifications")
    .update({ is_read: true })
    .eq("user_id", currentUserId)
    .eq("ticket_id", ticket.id)
    .eq("is_read", false);

  const slaStatus = getSlaStatus(ticket);
  const responseDueAt = ticket.response_due_at ?? ticket.sla_first_response_due;
  const resolutionDueAt = ticket.resolution_due_at ?? ticket.sla_resolution_due;

  // Fetch related data as separate flat queries
  const [
    { data: category },
    { data: creator },
    { data: assignee },
    { data: aiAnalysis },
    { data: comments },
    { data: organization },
    { data: creatorCompanyInfo },
  ] = await Promise.all([
    ticket.category_id
      ? svc.from("categories").select("name, slug, color, icon").eq("id", ticket.category_id).single()
      : Promise.resolve({ data: null }),
    svc.from("hd_profiles").select("full_name, avatar_url").eq("id", ticket.created_by).single(),
    ticket.assigned_to
      ? svc
          .from("hd_profiles")
          .select("id, full_name, avatar_url, specialty, availability_status")
          .eq("id", ticket.assigned_to)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isStaff
      ? svc.from("hd_ai_analysis").select("*").eq("ticket_id", id).single()
      : Promise.resolve({ data: null }),
    svc.from("hd_ticket_comments")
      .select("*, profiles:author_id(full_name, avatar_url, role)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    svc
      .from("organizations")
      .select("name, slug")
      .eq("id", ticket.organization_id)
      .single(),
    svc
      .from("hd_customers_info")
      .select("company_name, industry")
      .eq("id", ticket.created_by)
      .maybeSingle(),
  ]);

  // For customers: check if any staff is genuinely online (heartbeat-verified)
  // to decide whether to show the AI chat fallback.
  let onlineAgentCount: number | null = null;
  if (!isStaff && ticket.organization_id) {
    const { data: staffRows } = await svc
      .from("hd_profiles")
      .select("id, availability_status")
      .eq("organization_id", ticket.organization_id)
      .in("role", ["agent", "manager", "admin"])
      .in("availability_status", ["online", "busy"]);
    const staffIds = ((staffRows ?? []) as { id: string }[]).map((row) => row.id);
    const staffLastSeen = await getLastSeenMap(svc, staffIds);
    onlineAgentCount = ((staffRows ?? []) as { id: string; availability_status: string | null }[]).filter(
      (row) => effectivePresence(row.availability_status, staffLastSeen[row.id]) === "online"
    ).length;
  }

  const companyName =
    creatorCompanyInfo?.company_name?.trim() ||
    organization?.name ||
    "Organization";
  const companyCode = organization?.slug?.toUpperCase() ?? "ORG";
  const sector = creatorCompanyInfo?.industry?.trim() || "General";
  const creatorName = creator?.full_name?.trim() || "Requester";
  const creatorInitials = getInitials(creatorName);

  // Owner block. `formatAgentIdentity` is the same label /admin uses, and the
  // declared-status + heartbeat pair is the same one /admin and /team use, so
  // the ticket page cannot disagree with them about who is online.
  const assigneeProfile = assignee as {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    specialty: string | null;
    availability_status: string | null;
  } | null;
  const assigneeName = assigneeProfile ? formatAgentIdentity(assigneeProfile) : null;
  const assigneeLastSeen = assigneeProfile
    ? (await getLastSeenMap(svc, [assigneeProfile.id]))[assigneeProfile.id]
    : undefined;
  const assigneePresence = assigneeProfile
    ? effectivePresence(assigneeProfile.availability_status, assigneeLastSeen)
    : "offline";

  // Reassignment is admin-only, matching ADMIN_PATCH_FIELDS on the route that
  // performs it, so the option list is not even loaded for anyone else.
  const canReassign = profile.role === "admin";
  let assignableAgents: AgentOption[] = [];
  if (canReassign) {
    const { data: agentRows } = await svc
      .from("hd_profiles")
      .select("id, full_name, specialty, availability_status")
      .eq("organization_id", ticket.organization_id)
      .eq("role", "agent")
      .eq("is_active", true)
      .order("full_name");

    const rows = (agentRows ?? []) as {
      id: string;
      full_name: string | null;
      specialty: string | null;
      availability_status: string | null;
    }[];
    // Same declared-status + heartbeat pair the owner card above uses, so the
    // selector cannot disagree with the avatar right next to it.
    const agentLastSeen = await getLastSeenMap(svc, rows.map((agent) => agent.id));
    assignableAgents = sortAgentOptions(
      rows.map((agent) => ({
        id: agent.id,
        name: formatAgentIdentity(agent),
        presence: effectivePresence(agent.availability_status, agentLastSeen[agent.id]),
      }))
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
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
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge className="text-[var(--color-text-secondary)] border-[var(--color-surface-600)]">
            {companyName}
          </Badge>
          <Badge className="text-[var(--color-text-secondary)] border-[var(--color-surface-600)]">
            {companyCode}
          </Badge>
          <Badge className="text-[var(--color-text-secondary)] border-[var(--color-surface-600)]">
            {sector}
          </Badge>
        </div>
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
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t("description")}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
              {ticket.description && (
                <TranslateButton
                  text={ticket.description}
                  className="mt-3"
                />
              )}
            </CardContent>
          </Card>

          {(profile.role === "agent" || profile.role === "admin") && (
            <Card>
              <CardHeader>
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Chain of custody</p>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 sm:grid-cols-6 gap-1 text-center text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  {[
                    ["Intake", true],
                    ["Routed", Boolean(ticket.assigned_to)],
                    ["Execution", ticket.status !== "open"],
                    ["Admin OK", ticket.review_status === "pending" || ticket.review_status === "approved"],
                    ["Resolved", ticket.status === "resolved" || ticket.status === "closed"],
                    ["Customer OK", ticket.status === "closed"],
                  ].map(([label, active]) => (
                    <div key={String(label)}>
                      <div className={`mb-2 h-1 rounded-full ${active ? "bg-[var(--color-signal-blue)]" : "bg-[var(--color-surface-600)]"}`} />
                      {label}
                    </div>
                  ))}
                </div>
                <TicketWorkflowActions
                  ticketId={ticket.id}
                  role={profile.role}
                  status={ticket.status}
                  reviewStatus={ticket.review_status}
                />
                {/* Separate from the workflow controls above, and below them:
                    this is the exit for what the flow cannot express, not one
                    more step in it. */}
                {profile.role === "admin" && (
                  <div className="mt-3 border-t border-[var(--color-surface-700)] pt-3">
                    <AdminForceCloseAction ticketId={ticket.id} status={ticket.status} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <TicketComments
            ticketId={ticket.id}
            currentStatus={ticket.status}
            comments={comments ?? []}
            currentUserId={currentUserId}
            isStaff={isStaff}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Requester</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-semibold">
                  {creatorInitials}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{creatorName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {companyName} · {sector}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Who is actually on this ticket. The chain-of-custody strip below
              still reports whether it is routed; this says by whom. */}
          {isStaff && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                  {t("assignedTo")}
                </p>
                {assigneeProfile ? (
                  <div className="flex items-center gap-3">
                    <PresenceAvatar
                      name={assigneeName ?? ""}
                      avatarUrl={assigneeProfile.avatar_url}
                      status={assigneePresence}
                      size="sm"
                    />
                    <div className="min-w-0">
                      {/* No socket dot here: the avatar ring and the label
                          below already carry effectivePresence, and the dot
                          could disagree with both. */}
                      <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {assigneeName}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {t(`presence.${assigneePresence}`)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {t("unassigned")}
                  </div>
                )}

                {/* Same PATCH the admin cockpit performs; the route already
                    fires the ticket.assigned notification. */}
                {canReassign && (
                  <TicketAssigneeSelect
                    ticketId={ticket.id}
                    currentAssignee={ticket.assigned_to}
                    agents={assignableAgents}
                    disabled={ticket.status === "closed"}
                  />
                )}
              </CardContent>
            </Card>
          )}

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
                <div className="space-y-2">
                  {responseDueAt && (
                    <SlaCountdown
                      dueAt={responseDueAt}
                      label="Response"
                      breached={ticket.sla_breached ?? false}
                    />
                  )}
                  {resolutionDueAt && (
                    <SlaCountdown
                      dueAt={resolutionDueAt}
                      label="Resolution"
                      breached={ticket.sla_breached ?? false}
                    />
                  )}
                </div>
                {ticket.sla_breached && (
                  <p className="text-xs text-red-400 mt-1">{t("slaBreached")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {isStaff && aiAnalysis && (
            <AITriagePanel analysis={aiAnalysis} />
          )}

          {isStaff && !aiAnalysis && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">{t("aiTriage")}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{t("aiProcessing")}</p>
                {/* Triage runs as a background task at creation; if it never
                    landed the cron sweep retries within the hour, and an admin
                    can force it from here. */}
                {profile.role === "admin" && <ReanalyzeButton ticketId={ticket.id} />}
              </CardContent>
            </Card>
          )}

          {/* AI Support Chat — shown to customers when no agents are online */}
          {!isStaff && onlineAgentCount === 0 && (
            <AISupportChat
              ticketId={ticket.id}
              orgId={ticket.organization_id}
              locale={locale}
            />
          )}

          {/* Company sign-off: confirm the resolution or reopen within 48h */}
          {!isStaff && ticket.status === "resolved" && (
            <Card className="border-emerald-500/25">
              <CardContent className="py-4">
                <CustomerResolutionActions
                  ticketId={ticket.id}
                  resolvedAt={ticket.resolved_at}
                />
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
