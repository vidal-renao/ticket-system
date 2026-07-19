import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  PlayCircle,
  ShieldCheck,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { formatRelativeTime, formatTicketRef, priorityColor, statusColor } from "@/lib/utils";
import { effectivePresence, formatLastSeen } from "@/lib/presence";
import { getLastSeenMap } from "@/lib/presence-server";
import { ACTIVE_TICKET_STATUSES } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

type MemberTicket = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  sla_breached: boolean | null;
  review_status: "not_requested" | "pending" | "approved" | "changes_requested";
};

const PRESENCE_LABEL: Record<string, { text: string; cls: string }> = {
  online:  { text: "Online now",  cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  busy:    { text: "Busy",        cls: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  offline: { text: "Offline",     cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
};

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const { data: viewer } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (!viewer || !["manager", "admin"].includes(viewer.role) || !viewer.organization_id) {
    redirect(queuePath);
  }

  const { data: member } = await svc
    .from("profiles")
    .select("id, full_name, role, department, specialty, team_id, is_active, availability_status, created_at")
    .eq("id", id)
    .eq("organization_id", viewer.organization_id)
    .in("role", ["agent", "manager", "admin"])
    .maybeSingle();

  if (!member) notFound();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [lastSeenMap, { data: activeRows }, { count: resolvedToday }, { count: resolvedTotal }, { data: teamRow }] =
    await Promise.all([
      getLastSeenMap(svc, [member.id]),
      svc
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, sla_breached, review_status")
        .eq("organization_id", viewer.organization_id)
        .eq("assigned_to", member.id)
        .in("status", ACTIVE_TICKET_STATUSES)
        .is("deleted_at", null)
        .order("sla_breached", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      svc
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", viewer.organization_id)
        .eq("assigned_to", member.id)
        .eq("status", "resolved")
        .is("deleted_at", null)
        .gte("resolved_at", todayStart.toISOString()),
      svc
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", viewer.organization_id)
        .eq("assigned_to", member.id)
        .in("status", ["resolved", "closed"])
        .is("deleted_at", null),
      member.team_id
        ? svc.from("teams").select("name").eq("id", member.team_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const lastSeen = lastSeenMap[member.id] ?? null;
  const presence = effectivePresence(member.availability_status, lastSeenMap[member.id]);
  const presenceInfo = PRESENCE_LABEL[presence];

  const tickets = (activeRows ?? []) as MemberTicket[];
  const inProgress = tickets.filter((t) => t.status === "in_progress" && t.review_status !== "pending");
  const waiting = tickets.filter((t) => t.status === "pending_customer" || t.status === "pending_third_party");
  const readyForOk = tickets.filter((t) => t.review_status === "pending");
  const assigned = tickets.filter((t) => t.status === "open");
  const currentTask = inProgress[0] ?? null;

  const teamBase = locale === "de" ? "/team" : `/${locale}/team`;
  const ticketBase = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  const memberName = member.full_name?.trim() || "Team member";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link
        href={teamBase}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
      >
        <ArrowLeft className="w-4 h-4" /> Team
      </Link>

      {/* Header */}
      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PresenceAvatar name={memberName} status={presence} queueCount={tickets.length} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{memberName}</h1>
              <Badge className={presenceInfo.cls}>{presenceInfo.text}</Badge>
              {!member.is_active && (
                <Badge className="text-red-400 bg-red-500/10 border-red-500/20">Deactivated</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              <span className="capitalize">{member.role === "agent" ? "Employee" : member.role}</span>
              {member.specialty && <> · {member.specialty}</>}
              {teamRow?.name && <> · Team {teamRow.name}</>}
              {member.department && <> · {member.department}</>}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {presence === "offline" ? `Last seen: ${formatLastSeen(lastSeen)}` : "Connected — heartbeat active"}
            </p>
          </div>
        </div>
      </Card>

      {/* Current task */}
      <Card className={`mb-6 ${currentTask ? "border-blue-500/25" : ""}`}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-300" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Current task</span>
          </div>
        </CardHeader>
        <CardContent>
          {currentTask ? (
            <Link href={`${ticketBase}/${currentTask.id}`} className="group block">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-[var(--color-signal-blue)]">
                  {formatTicketRef(currentTask.ticket_number)}
                </span>
                <Badge className={priorityColor(currentTask.priority)}>{currentTask.priority}</Badge>
                {currentTask.sla_breached && (
                  <Badge className="border-red-400/20 bg-red-500/10 text-red-300">
                    <AlertTriangle className="w-3 h-3" /> SLA
                  </Badge>
                )}
                <span className="text-xs text-[var(--color-text-muted)]">
                  started {formatRelativeTime(currentTask.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors group-hover:text-blue-200">
                {currentTask.title}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              {presence === "offline"
                ? "Not connected and no ticket in progress."
                : "Connected but no ticket in progress right now."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Workload stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={<PlayCircle className="w-5 h-5 text-blue-400" />}     label="In progress"      value={inProgress.length} />
        <Stat icon={<Clock className="w-5 h-5 text-amber-400" />}         label="Waiting"          value={waiting.length + assigned.length} />
        <Stat icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} label="Ready for OK"     value={readyForOk.length} />
        <Stat icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}  label="Resolved today"   value={resolvedToday ?? 0} sub={`${resolvedTotal ?? 0} total`} />
      </div>

      {/* Active queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Active queue</span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">{tickets.length} tickets</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No active tickets assigned.
            </p>
          )}
          <div className="divide-y divide-[var(--color-surface-600)]">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`${ticketBase}/${ticket.id}`}
                className="flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors hover:bg-[var(--color-surface-800)]"
              >
                <span className="font-mono text-xs text-[var(--color-signal-blue)] shrink-0">
                  {formatTicketRef(ticket.ticket_number)}
                </span>
                <p className="flex-1 min-w-0 truncate text-sm text-[var(--color-text-primary)]">
                  {ticket.title}
                </p>
                <Badge className={`hidden sm:inline-flex ${priorityColor(ticket.priority)}`}>{ticket.priority}</Badge>
                <Badge className={statusColor(ticket.status)}>
                  {ticket.review_status === "pending" ? "ready for OK" : ticket.status.replaceAll("_", " ")}
                </Badge>
                {ticket.sla_breached && (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" aria-label="SLA breached" />
                )}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-start justify-between">{icon}</div>
        <p className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">{value}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {label}
          {sub && <span className="ml-1 text-[var(--color-text-muted)]">· {sub}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
