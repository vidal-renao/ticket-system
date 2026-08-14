import type { EffectivePresence } from "@/lib/presence";

/**
 * An agent as offered in a reassignment control.
 *
 * `presence` is always the value `effectivePresence` produced -- the declared
 * status already degraded by heartbeat -- never the raw `availability_status`.
 * A profile that still says "online" but stopped reporting is offline here,
 * which is the same rule the routing engine applies when it picks an owner.
 */
export interface AgentOption {
  id: string;
  name: string;
  presence: EffectivePresence;
}

/**
 * Only "online" counts as available, matching routing: "busy" is a person
 * declaring they cannot take more work, not a person who is away.
 */
export function isAgentAvailable(presence: EffectivePresence): boolean {
  return presence === "online";
}

/**
 * Available first, then busy, then offline; alphabetical within each band.
 *
 * Busy sitting above offline is deliberate: both are unavailable, but someone
 * marked busy is at their desk and will see the ticket, which makes them the
 * better of two bad choices when an admin has to assign anyway.
 */
const PRESENCE_RANK: Record<EffectivePresence, number> = {
  online: 0,
  busy: 1,
  offline: 2,
};

export function sortAgentOptions(agents: AgentOption[]): AgentOption[] {
  return [...agents].sort(
    (a, b) => PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || a.name.localeCompare(b.name)
  );
}

/** Split for rendering: a native <select> conveys the two bands as optgroups. */
export function partitionAgentOptions(agents: AgentOption[]): {
  available: AgentOption[];
  unavailable: AgentOption[];
} {
  const sorted = sortAgentOptions(agents);
  return {
    available: sorted.filter((agent) => isAgentAvailable(agent.presence)),
    unavailable: sorted.filter((agent) => !isAgentAvailable(agent.presence)),
  };
}
