import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getTicketsByRole } from "@/lib/ticket-visibility";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { AlertTriangle, CheckCircle2, Clock3, Inbox, PlayCircle, ShieldCheck } from "lucide-react";
import { formatRelativeTime, formatTicketRef, priorityColor, statusColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AgentTicket = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to: string | null;
  sla_breached: boolean | null;
  review_status: "not_requested" | "pending" | "approved" | "changes_requested";
};

export default async function QueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile?.organization_id) redirect(loginPath);
  if (profile.role !== "agent") {
    redirect(profile.role === "admin" || profile.role === "manager"
      ? (locale === "de" ? "/admin" : `/${locale}/admin`)
      : (locale === "de" ? "/tickets" : `/${locale}/tickets`));
  }

  const [{ data: ticketRows, error }, { data: organization }] = await Promise.all([
    getTicketsByRole(
      svc,
      profile,
      "id, ticket_number, title, status, priority, created_at, assigned_to, sla_breached, review_status"
    )
      .is("deleted_at", null)
      .order("sla_breached", { ascending: false })
      .order("created_at", { ascending: false }),
    svc.from("organizations").select("name, slug").eq("id", profile.organization_id).single(),
  ]);
  if (error) console.error("[AgentWorkspace] ticket query failed", { actorId: user.id, error: error.message });

  const tickets = (ticketRows ?? []) as AgentTicket[];
  const groups = [
    {
      key: "assigned",
      label: "Assigned",
      description: "Ready to start",
      icon: <Inbox className="h-4 w-4 text-cyan-300" />,
      tickets: tickets.filter((ticket) => ticket.status === "open"),
    },
    {
      key: "progress",
      label: "In progress",
      description: "Currently being handled",
      icon: <PlayCircle className="h-4 w-4 text-blue-300" />,
      tickets: tickets.filter((ticket) => ticket.status === "in_progress" && ticket.review_status !== "pending"),
    },
    {
      key: "waiting",
      label: "Waiting",
      description: "Customer or third-party dependency",
      icon: <Clock3 className="h-4 w-4 text-amber-300" />,
      tickets: tickets.filter((ticket) => ticket.status === "pending_customer" || ticket.status === "pending_third_party"),
    },
    {
      key: "ready",
      label: "Ready for admin OK",
      description: "Submitted and locked for review",
      icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />,
      tickets: tickets.filter((ticket) => ticket.review_status === "pending"),
    },
    {
      key: "processed",
      label: "Resolved",
      description: "Approved or closed work",
      icon: <CheckCircle2 className="h-4 w-4 text-violet-300" />,
      tickets: tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed"),
    },
  ];
  const activeCount = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const breachedCount = tickets.filter((ticket) => ticket.sla_breached).length;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-signal-blue)]">Specialist workspace</p>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">My assigned work</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Only tickets explicitly assigned to your profile are visible here.</p>
        </div>
        <Card className="flex items-center gap-3 px-4 py-3">
          <PresenceAvatar name={profile.full_name?.trim() || "Agent"} status={profile.availability_status} queueCount={activeCount} size="md" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{profile.full_name?.trim() || "Agent"}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{profile.specialty?.trim() || "General support"} · {organization?.slug?.toUpperCase() ?? "ORG"}</p>
          </div>
        </Card>
      </header>

      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active" value={activeCount} />
        <Metric label="Ready for OK" value={groups[3].tickets.length} tone="success" />
        <Metric label="Resolved" value={groups[4].tickets.length} />
        <Metric label="SLA breached" value={breachedCount} tone={breachedCount ? "danger" : "default"} />
      </section>

      <div className="space-y-7">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-2">
              {group.icon}
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</h2>
                <p className="text-xs text-[var(--color-text-muted)]">{group.description}</p>
              </div>
              <Badge className="ml-auto border-[var(--color-surface-600)] bg-[var(--color-surface-800)] text-[var(--color-text-secondary)]">{group.tickets.length}</Badge>
            </div>
            {group.tickets.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {group.tickets.map((ticket) => {
                  const href = locale === "de" ? `/tickets/${ticket.id}` : `/${locale}/tickets/${ticket.id}`;
                  return (
                    <Link key={ticket.id} href={href} className="group">
                      <Card hover className={`h-full p-4 ${ticket.sla_breached ? "border-red-400/25" : ""}`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-[var(--color-signal-blue)]">{formatTicketRef(ticket.ticket_number)}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{formatRelativeTime(ticket.created_at)}</span>
                        </div>
                        <p className="mb-3 line-clamp-2 text-sm font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-blue-200">{ticket.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={priorityColor(ticket.priority)}>{ticket.priority}</Badge>
                          <Badge className={statusColor(ticket.status)}>{ticket.review_status === "pending" ? "ready for OK" : ticket.status.replaceAll("_", " ")}</Badge>
                          {ticket.sla_breached && <Badge className="border-red-400/20 bg-red-500/10 text-red-300"><AlertTriangle className="h-3 w-3" /> SLA</Badge>}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--color-surface-600)] px-4 py-5 text-xs text-[var(--color-text-muted)]">No tickets in this stage.</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "danger" }) {
  const className = tone === "danger" ? "border-red-400/20 bg-red-500/10" : tone === "success" ? "border-emerald-400/20 bg-emerald-500/10" : "";
  return (
    <Card className={`p-4 ${className}`}>
      <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--color-text-primary)]">{value}</p>
    </Card>
  );
}
