/**
 * The SLA compliance percentage is only carried in the delivered email subject,
 * so the /ops console parses it from the audit run's payload snapshot. Kept
 * free of server imports so the parsing can be tested on its own.
 *
 * Three subject formats exist in the delivery history, all written by the
 * external vidal-helpdesk-mcp pipeline:
 *
 * - until 2026-10-02: "VIDAL Daily SLA Report: 100% compliance - 2026-08-01"
 * - October 2026:     "[Needs attention] 5 active tickets · 100% SLA · 3 unowned — Org · 3 Oct"
 * - current:          "[Needs attention] 5 active tickets · SLA 30d 85% · 3 unowned — Org · 17 Nov"
 *
 * The newer formats say "SLA not measured", "SLA 30d not measured" or
 * "no resolved tickets in 30d" when there is nothing to measure; those carry
 * no percentage and read as null, which is the truth.
 */
const PATTERNS = [
  // "SLA 30d 85%" -- percentage after the window
  /\bSLA\s+\d+\s*d\s+(\d+(?:[.,]\d+)?)\s*%/i,
  // "85% compliance" / "85% SLA" -- percentage first
  /(\d+(?:[.,]\d+)?)\s*%\s*(?:compliance|SLA)\b/i,
];

export function complianceFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const subject = (snapshot as { subject?: unknown }).subject;
  if (typeof subject !== "string") return null;
  for (const pattern of PATTERNS) {
    const match = subject.match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(match[1].replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}
