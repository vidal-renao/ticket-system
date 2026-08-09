export interface RoutingCandidate {
  id: string;
  specialty: string | null;
  teamId?: string | null;
  teamName?: string | null;
  activeTickets: number;
  /**
   * Whether the agent is reachable right now, per `effectivePresence`.
   * Optional and treated as available when absent, so callers that route
   * without presence data (and the pure specialty tests) behave as before.
   */
  available?: boolean;
}

export type RoutingReason =
  /** Matched on specialty or team. */
  | "specialist"
  /** No specialty matched; sent to the freest available agent. */
  | "overflow"
  /** Agents exist, none of them reachable. Left unassigned on purpose. */
  | "no_agents_available"
  /** The organization has no active agent at all. */
  | "no_agents";

export interface RoutingDecision {
  agent: RoutingCandidate | null;
  reason: RoutingReason;
}

/**
 * Marker stored on `tickets.metadata.routing_status` when routing declined to
 * assign because nobody was reachable, so the queue can tell that apart from a
 * ticket that is merely new.
 */
export const ROUTING_AWAITING_AVAILABILITY = "awaiting_availability";

const CATEGORY_ALIASES: Record<string, string[]> = {
  software: ["software", "application", "applications", "app", "saas", "m365", "office 365"],
  hardware: ["hardware", "device", "devices", "computer", "laptop", "printer"],
  networking: ["networking", "network", "wifi", "vpn", "connectivity"],
  security: ["security", "cybersecurity", "access", "identity", "password"],
  email: ["email", "mail", "outlook", "exchange"],
  billing: ["billing", "finance", "invoice", "payment"],
};

export function normalizeRoutingLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalRoutingLabel(value: string | null | undefined): string {
  const normalized = normalizeRoutingLabel(value);
  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (normalized === canonical || aliases.some((alias) => normalized.includes(alias))) return canonical;
  }
  return normalized;
}

export function selectSpecialistAgent(
  candidates: RoutingCandidate[],
  input: { categoryName?: string | null; teamId?: string | null; teamName?: string | null }
): RoutingCandidate | null {
  const category = canonicalRoutingLabel(input.categoryName);
  const teamName = canonicalRoutingLabel(input.teamName);
  const matches = candidates.filter((candidate) => {
    if (input.teamId && candidate.teamId === input.teamId) return true;
    const specialty = canonicalRoutingLabel(candidate.specialty);
    const candidateTeam = canonicalRoutingLabel(candidate.teamName);
    return Boolean(
      (category && (specialty === category || candidateTeam === category)) ||
      (teamName && (specialty === teamName || candidateTeam === teamName))
    );
  });

  return matches.sort((a, b) => a.activeTickets - b.activeTickets || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Overflow fallback: the freest agent in the organization, regardless of
 * specialty.
 *
 * `selectSpecialistAgent` returns null whenever nothing matches the ticket's
 * category or team, which means every request outside the specialties actually
 * staffed (hardware, software, networking today) was landing unassigned. A
 * ticket nobody owns is a ticket nobody sees, so an imperfect owner beats no
 * owner: the SLA clock then has someone to chase.
 *
 * Same load ordering as the specialist tie-break, so the two paths distribute
 * work identically. Sorts a copy — callers keep their array untouched.
 */
export function selectFreestAgent(candidates: RoutingCandidate[]): RoutingCandidate | null {
  return [...candidates].sort((a, b) => a.activeTickets - b.activeTickets || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * The whole automatic-routing decision, as a pure function.
 *
 * Availability gates the candidate pool before anything else: an agent who is
 * offline or busy is not routed to, because the declared presence signal is
 * what the rest of the product treats as the truth about who is working.
 * Assigning to someone offline would contradict the badge the app shows.
 *
 * When nobody is reachable the ticket stays unassigned rather than being
 * forced onto an absent agent. That is only safe because the caller marks it
 * as awaiting availability so it stands out in the queue, and because the SLA
 * clock keeps running on it either way.
 */
export function routeTicket(
  candidates: RoutingCandidate[],
  input: { categoryName?: string | null; teamId?: string | null; teamName?: string | null }
): RoutingDecision {
  if (!candidates.length) return { agent: null, reason: "no_agents" };

  const available = candidates.filter((candidate) => candidate.available !== false);
  if (!available.length) return { agent: null, reason: "no_agents_available" };

  const specialist = selectSpecialistAgent(available, input);
  if (specialist) return { agent: specialist, reason: "specialist" };

  const freest = selectFreestAgent(available);
  return freest ? { agent: freest, reason: "overflow" } : { agent: null, reason: "no_agents_available" };
}

export function inferTicketCategory(title: string, description: string): string | null {
  const input = normalizeRoutingLabel(`${title} ${description}`);
  let best: { category: string; score: number } | null = null;
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const score = aliases.reduce((total, alias) => total + (input.includes(alias) ? 1 : 0), input.includes(category) ? 2 : 0);
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? null;
}
