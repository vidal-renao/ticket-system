import type { CurrentProfile } from "@/lib/authz";

type QueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type AgentIdentity = {
  id?: string | null;
  full_name?: string | null;
  specialty?: string | null;
};

type TicketAccessRow = {
  id: string;
  organization_id: string;
  assigned_to: string | null;
};

type TicketAccessResult<T> =
  | { kind: "allowed"; ticket: T }
  | { kind: "forbidden"; ticket: TicketAccessRow }
  | { kind: "not_found" };

const DEBUG_ACCESS = process.env.DEBUG === "true";

function debugInfo(message: string, payload: Record<string, unknown>) {
  if (DEBUG_ACCESS) console.info(message, payload);
}

function debugWarn(message: string, payload: Record<string, unknown>) {
  if (DEBUG_ACCESS) console.warn(message, payload);
}

function debugError(message: string, payload: Record<string, unknown>) {
  if (DEBUG_ACCESS) console.error(message, payload);
}

export function applyTicketVisibilityScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  profile: Pick<CurrentProfile, "id" | "role" | "organization_id">,
  options?: { includeUnassignedForAgents?: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const scoped = query.eq("organization_id", profile.organization_id);

  if (profile.role !== "agent") {
    return scoped;
  }

  if (options?.includeUnassignedForAgents === false) {
    return scoped.eq("assigned_to", profile.id);
  }

  return scoped.or(`assigned_to.eq.${profile.id},assigned_to.is.null`);
}

export function getTicketsByRole(
  client: QueryClient,
  profile: Pick<CurrentProfile, "id" | "role" | "organization_id">,
  select: string,
  options?: { includeUnassignedForAgents?: boolean }
) {
  return applyTicketVisibilityScope(client.from("tickets").select(select), profile, options);
}

export async function getTicketIdsBySuggestedCategory(
  client: QueryClient,
  organizationId: string,
  category: string
): Promise<string[]> {
  const { data, error } = await client
    .from("ai_analysis")
    .select("ticket_id, tickets!inner(id, organization_id)")
    .eq("suggested_category", category)
    .eq("tickets.organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    debugError("[TicketFilters] failed category lookup", {
      organizationId,
      category,
      error: error.message,
    });
    return [];
  }

  return [...new Set(((data ?? []) as Array<{ ticket_id: string | null }>).map((row) => row.ticket_id).filter((value): value is string => Boolean(value)))];
}

export function applyTicketSlaFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter: string | undefined,
  now = new Date()
) {
  if (!filter) return query;

  const nowIso = now.toISOString();
  const hourAheadIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  if (filter === "breached") {
    return query.eq("sla_breached", true);
  }

  if (filter === "at_risk") {
    return query
      .eq("sla_breached", false)
      .or(
        [
          `and(first_agent_response_at.is.null,response_due_at.not.is.null,response_due_at.gt.${nowIso},response_due_at.lte.${hourAheadIso})`,
          `and(status.not.in.(resolved,closed),resolution_due_at.not.is.null,resolution_due_at.gt.${nowIso},resolution_due_at.lte.${hourAheadIso})`,
        ].join(",")
      );
  }

  if (filter === "on_time") {
    return query
      .eq("sla_breached", false)
      .or(
        [
          "and(first_agent_response_at.is.null,response_due_at.is.null)",
          "and(first_agent_response_at.not.is.null,resolution_due_at.is.null)",
          `and(first_agent_response_at.is.null,response_due_at.gt.${hourAheadIso})`,
          `and(status.not.in.(resolved,closed),resolution_due_at.gt.${hourAheadIso})`,
          "and(status.in.(resolved,closed),resolution_due_at.not.is.null)",
        ].join(",")
      );
  }

  return query;
}

export async function resolveTicketAccess<T>(
  client: QueryClient,
  profile: Pick<CurrentProfile, "id" | "role" | "organization_id">,
  ticketId: string,
  select: string,
  options?: { includeUnassignedForAgents?: boolean }
): Promise<TicketAccessResult<T>> {
  const { data: baseTicket, error: baseError } = await client
    .from("tickets")
    .select("id, organization_id, assigned_to")
    .eq("id", ticketId)
    .maybeSingle();

  if (baseError) {
    debugError("[TicketAccess] failed base lookup", {
      ticketId,
      userId: profile.id,
      role: profile.role,
      error: baseError.message,
    });
  }

  if (!baseTicket) {
    return { kind: "not_found" };
  }

  if (baseTicket.organization_id !== profile.organization_id) {
    debugWarn("[TicketAccess] organization mismatch", {
      ticketId,
      userId: profile.id,
      role: profile.role,
    });
    return { kind: "forbidden", ticket: baseTicket as TicketAccessRow };
  }

  if (
    profile.role === "agent" &&
    baseTicket.assigned_to &&
    baseTicket.assigned_to !== profile.id &&
    options?.includeUnassignedForAgents !== false
  ) {
    debugWarn("[TicketAccess] agent attempted to access foreign assignment", {
      ticketId,
      userId: profile.id,
    });
    return { kind: "forbidden", ticket: baseTicket as TicketAccessRow };
  }

  if (
    profile.role === "agent" &&
    options?.includeUnassignedForAgents === false &&
    baseTicket.assigned_to !== profile.id
  ) {
    debugWarn("[TicketAccess] agent attempted to access non-owned ticket", {
      ticketId,
      userId: profile.id,
    });
    return { kind: "forbidden", ticket: baseTicket as TicketAccessRow };
  }

  const scopedQuery = applyTicketVisibilityScope(
    client.from("tickets").select(select).eq("id", ticketId),
    profile,
    options
  );

  const { data: ticket, error } = await scopedQuery.single();

  if (error) {
    debugError("[TicketAccess] failed scoped lookup", {
      ticketId,
      userId: profile.id,
      role: profile.role,
      error: error.message,
    });
  }

  if (!ticket) {
    return { kind: "not_found" };
  }

  return { kind: "allowed", ticket: ticket as T };
}

export function formatAgentIdentity(agent: AgentIdentity | null | undefined): string {
  const baseName = agent?.full_name?.trim() || "Unassigned";
  const specialty = agent?.specialty?.trim();
  return specialty ? `${baseName} (${specialty})` : baseName;
}

export function getInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "??";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function isDebugLoggingEnabled() {
  return DEBUG_ACCESS;
}

export function debugTicketFilters(message: string, payload: Record<string, unknown>) {
  debugInfo(message, payload);
}
