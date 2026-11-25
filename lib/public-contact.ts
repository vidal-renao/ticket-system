/**
 * Where the public "contact" call-to-action on the landing page goes.
 *
 * Both landing components used to inline `NEXT_PUBLIC_CONTACT_EMAIL ??
 * "contact@vidallab.ch"`. The variable was never set in production and
 * vidallab.ch does not exist in DNS, so every "Request demo" click composed an
 * email that could only bounce -- the page's one conversion was dead and
 * nothing said so.
 *
 * The rule now: a mailbox is used only when one is explicitly configured.
 * Otherwise the CTA points at a public profile that is known to exist (the same
 * one the footer already links), and its label says "get in touch" rather than
 * promising a demo request that nobody would receive.
 *
 * Note the literal `process.env.X` reads: LandingNav is a client component, and
 * Next only inlines public env vars when they appear as literal member
 * expressions.
 */

/** Public profile used by the footer and as the contact fallback. */
export const LINKEDIN_URL = "https://www.linkedin.com/in/vidalrenao";

export const GITHUB_URL = "https://github.com/vidal-renao";

export type PublicContact =
  | { kind: "email"; href: string }
  | { kind: "profile"; href: string };

const CONFIGURED_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const CONFIGURED_URL = process.env.NEXT_PUBLIC_CONTACT_URL;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_SUBJECT = "HelpDesk AI product demo";

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the landing CTA target: a configured mailbox, then a configured
 * https contact page, then the LinkedIn profile. A malformed value is ignored
 * rather than rendered, so a typo cannot produce a broken link.
 *
 * `overrides` exists for tests; production always reads the constants above.
 */
export function publicContact(overrides?: { email?: string; url?: string }): PublicContact {
  const email = (overrides ? overrides.email : CONFIGURED_EMAIL)?.trim();
  if (email && EMAIL_PATTERN.test(email)) {
    return {
      kind: "email",
      href: `mailto:${email}?subject=${encodeURIComponent(DEMO_SUBJECT)}`,
    };
  }

  const url = httpsUrl(overrides ? overrides.url : CONFIGURED_URL);
  return { kind: "profile", href: url ?? LINKEDIN_URL };
}
