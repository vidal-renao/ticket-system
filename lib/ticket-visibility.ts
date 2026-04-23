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

export function applyTicketVisibilityScope(
  // The Supabase query builder type becomes recursively huge once chained
  // through server-route generics, so keep this helper intentionally loose.
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

export function formatAgentIdentity(agent: AgentIdentity | null | undefined): string {
  const baseName = agent?.full_name?.trim() || "Unassigned";
  const specialty = agent?.specialty?.trim();
  return specialty ? `${baseName} (${specialty})` : baseName;
}
