import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getAuditSummary } from "@/lib/ops/audit-source";
import { buildSeedEvents } from "@/lib/ops/derive";
import {
  OPS_AI_ANALYSIS_COLUMNS,
  OPS_AUDIT_LOG_COLUMNS,
  OPS_COMMENT_COLUMNS,
  OPS_TICKET_COLUMNS,
  type OpsAiAnalysis,
  type OpsAuditLog,
  type OpsAuthor,
  type OpsComment,
  type OpsTicket,
} from "@/lib/ops/types";
import { OpsConsole } from "./OpsConsole";

export const dynamic = "force-dynamic";

const TICKET_LIMIT = 500;
const SEED_EVENT_LIMIT = 40;

export async function generateMetadata() {
  const t = await getTranslations("ops");
  return { title: t("title") };
}

export default async function OpsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const localePrefix = locale === "de" ? "" : `/${locale}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${localePrefix}/login`);

  // Profiles are read with the service client for the same reason as the app
  // layout: a profiles RLS hiccup must not turn into a redirect loop.
  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // The console reports on the whole organization; agents and customers get a
  // partial, misleading picture through RLS, so they are sent back to their
  // own dashboard.
  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    redirect(`${localePrefix}/dashboard`);
  }
  const organizationId = profile.organization_id as string | null;
  if (!organizationId) redirect(`${localePrefix}/dashboard`);

  // Everything below is read with the *user's* client so RLS is the boundary,
  // exactly as it will be for the realtime stream.
  const [ticketsResult, commentsResult, auditLogsResult, aiResult, orgResult, audit] =
    await Promise.all([
      supabase
        .from("tickets")
        .select(OPS_TICKET_COLUMNS)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(TICKET_LIMIT),
      supabase
        .from("ticket_comments")
        .select(OPS_COMMENT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(SEED_EVENT_LIMIT),
      supabase
        .from("ticket_audit_logs")
        .select(OPS_AUDIT_LOG_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(SEED_EVENT_LIMIT),
      supabase
        .from("ai_analysis")
        .select(OPS_AI_ANALYSIS_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(60),
      svc.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      getAuditSummary(organizationId),
    ]);

  const tickets = (ticketsResult.data ?? []) as unknown as OpsTicket[];
  const comments = (commentsResult.data ?? []) as unknown as OpsComment[];
  const auditLogs = (auditLogsResult.data ?? []) as unknown as OpsAuditLog[];
  const aiAnalysis = (aiResult.data ?? []) as unknown as OpsAiAnalysis[];

  // Realtime payloads carry raw rows only, so the console needs a name map up
  // front; unknown authors arriving later are fetched one by one client-side.
  const authorIds = new Set<string>();
  for (const ticket of tickets) {
    authorIds.add(ticket.created_by);
    if (ticket.assigned_to) authorIds.add(ticket.assigned_to);
  }
  for (const comment of comments) authorIds.add(comment.author_id);
  for (const log of auditLogs) if (log.actor_id) authorIds.add(log.actor_id);

  let authors: OpsAuthor[] = [];
  if (authorIds.size > 0) {
    const { data } = await svc
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", organizationId)
      .in("id", [...authorIds]);
    authors = (data ?? []) as unknown as OpsAuthor[];
  }

  return (
    <OpsConsole
      initialData={{
        tickets,
        events: buildSeedEvents(tickets, comments, auditLogs),
        authors,
        aiAnalysis,
        organizationName: orgResult.data?.name ?? "—",
        organizationId,
        viewerRole: profile.role as string,
      }}
      initialAudit={audit}
      locale={locale}
    />
  );
}
