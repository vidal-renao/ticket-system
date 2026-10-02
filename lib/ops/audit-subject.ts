/**
 * The SLA compliance percentage is only carried in the delivered email subject,
 * so the /ops console parses it from the audit run's payload snapshot. Kept
 * free of server imports so the parsing can be tested on its own.
 *
 * Two subject formats exist in the delivery history, both written by the
 * external vidal-helpdesk-mcp pipeline:
 *
 * - until 2026-10-02: "VIDAL Daily SLA Report: 100% compliance - 2026-08-01"
 * - from 2026-10-03:  "[Needs attention] 5 active tickets · 100% SLA · 3 unowned — Org · 3 Oct"
 *
 * The newer format says "SLA not measured" when no active ticket has an SLA
 * deadline; that has no percentage and reads as null, which is the truth.
 */
export function complianceFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const subject = (snapshot as { subject?: unknown }).subject;
  if (typeof subject !== "string") return null;
  const match = subject.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:compliance|SLA)\b/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
