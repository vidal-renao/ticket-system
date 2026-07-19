/**
 * Automatic CIF/NIF generation for companies onboarded by an administrator.
 *
 * When a company is created without a tax identifier, the system issues a
 * synthetic-but-well-formed Spanish CIF (letter + 7 digits + control
 * character, per the official mod-10 algorithm) so every company always has a
 * fiscal reference. The company can later replace it with its real CIF/NIF in
 * Settings → Company profile.
 */

const CONTROL_LETTERS = "JABCDEFGHI";

/** Compute the CIF control character for a 7-digit body. */
export function cifControlChar(orgLetter: string, digits: string): string {
  let evenSum = 0;
  let oddSum = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = Number(digits[i]);
    if ((i + 1) % 2 === 0) {
      evenSum += n;
    } else {
      const doubled = n * 2;
      oddSum += Math.floor(doubled / 10) + (doubled % 10);
    }
  }
  const control = (10 - ((evenSum + oddSum) % 10)) % 10;
  // Organization letters K, P, Q, S use a control LETTER; the common company
  // forms (A, B) use the control digit.
  if ("KPQSNW".includes(orgLetter)) return CONTROL_LETTERS[control];
  return String(control);
}

export function isValidGeneratedCif(value: string): boolean {
  const match = /^([ABKPQSNW])(\d{7})([0-9JABCDEFGHI])$/.exec(value.trim().toUpperCase());
  if (!match) return false;
  return cifControlChar(match[1], match[2]) === match[3];
}

/**
 * Generate a CIF. Deterministic when a seed is provided (same company name →
 * same digits), otherwise random. Default organization letter "B" (S.L.).
 */
export function generateCif(seed?: string, orgLetter: "A" | "B" = "B"): string {
  let digits = "";
  if (seed && seed.trim()) {
    // Simple FNV-1a over the seed for stable digits per company name.
    let hash = 0x811c9dc5;
    for (const char of seed.trim().toLowerCase()) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    digits = String(hash % 10_000_000).padStart(7, "0");
  } else {
    digits = String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0");
  }
  return `${orgLetter}${digits}${cifControlChar(orgLetter, digits)}`;
}
