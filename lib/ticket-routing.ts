export interface RoutingCandidate {
  id: string;
  specialty: string | null;
  teamId?: string | null;
  teamName?: string | null;
  activeTickets: number;
}

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

export function inferTicketCategory(title: string, description: string): string | null {
  const input = normalizeRoutingLabel(`${title} ${description}`);
  let best: { category: string; score: number } | null = null;
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const score = aliases.reduce((total, alias) => total + (input.includes(alias) ? 1 : 0), input.includes(category) ? 2 : 0);
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? null;
}
