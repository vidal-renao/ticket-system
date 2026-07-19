/**
 * Smart free-text matching for ticket lists. The query is split into tokens;
 * every token must match at least one of the ticket's searchable fields
 * (AND across tokens, OR across fields), so "critical acme vpn" finds ACME's
 * critical VPN tickets regardless of word order. Accents are ignored and
 * "TK-0042" / "0042" / "42" all match ticket number 42.
 */

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ticketRefTokens(ticketNumber: number | null | undefined): string[] {
  if (!ticketNumber && ticketNumber !== 0) return [];
  const raw = String(ticketNumber);
  return [`tk-${raw.padStart(4, "0")}`, raw.padStart(4, "0"), raw];
}

export function matchesTicketQuery(
  query: string | undefined,
  fields: Array<string | number | null | undefined>
): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;

  const haystack = fields
    .filter((field): field is string | number => field !== null && field !== undefined && field !== "")
    .map((field) => normalize(String(field)));

  const tokens = normalize(q).split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}
