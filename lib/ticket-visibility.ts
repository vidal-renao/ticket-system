import type { CurrentProfile } from "@/lib/authz";

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
};

type QueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type AgentIdentity = {
  id?: string | null;
  full_name?: string | null;
  specialty?: string | null;
};

export function applyTicketVisibilityScope<T extends QueryBuilder>(
  query: T,
  profile: Pick<CurrentProfile, "id" | "role" | "organization_id">,
  options?: { includeUnassignedForAgents?: boolean }
): T {
  const scoped = query.eq("organization_id", profile.organization_id);

  if (profile.role !== "agent") {
    return scoped as T;
  }

  if (options?.includeUnassignedForAgents === false) {
    return scoped.eq("assigned_to", profile.id) as T;
  }

  return scoped.or(`assigned_to.eq.${profile.id},assigned_to.is.null`) as T;
}

export function getTicketsByRole(
  client: QueryClient,
  profile: Pick<CurrentProfile, "id" | "role" | "organization_id">,
  select: string,
  options?: { includeUnassignedForAgents?: boolean }
) {
  return applyTicketVisibilityScope(client.from("tickets").select(select), profile, options);
}

export function formatAgentIdentity(agent: AgentIdentity | null | undefined): string {
  const baseName = agent?.full_name?.trim() || "Unassigned";
  const specialty = agent?.specialty?.trim();
  return specialty ? `${baseName} (${specialty})` : baseName;
}

