/**
 * Regex-based PII scrubber for ticket content.
 *
 * Covers structural PII detectable without NLP:
 *   - Email addresses
 *   - Swiss & international phone numbers
 *   - IPv4 addresses (common in IT support tickets)
 *
 * Named entities (person names) are intentionally NOT scrubbed here —
 * Claude's `contains_pii_detected` flag handles them at the AI layer
 * and the DSG-safe triage prompt instructs the model not to reproduce PII.
 *
 * Called in the AI triage pipeline when `pii_scrubbing_enabled = true`.
 */

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: "email",
    re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // Swiss format: +41 XX XXX XX XX  |  044 XXX XX XX  |  0800 XXX XXX
    name: "phone_ch",
    re: /(\+41|0041)[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b|0[1-9]\d[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g,
  },
  {
    // International: +XX(X) followed by 7–12 digits (spaces/dashes allowed)
    name: "phone_intl",
    re: /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{3,5}([\s\-]?\d{1,5})?/g,
  },
  {
    name: "ipv4",
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
];

export function scrubPII(text: string): string {
  let result = text;
  for (const { re } of PATTERNS) {
    result = result.replace(re, "[REDACTED]");
  }
  return result;
}
