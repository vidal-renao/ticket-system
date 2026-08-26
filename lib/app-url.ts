/**
 * The origin this deployment answers on.
 *
 * Six call sites used to inline their own `process.env.NEXT_PUBLIC_APP_URL ??
 * "..."`, and the fallbacks had drifted into two different answers: the auth
 * routes said ticket-system-sigma-pink.vercel.app, the metadata and sitemap
 * said helpdesk.vidallab.ch -- a domain that is not attached to the Vercel
 * project at all. Whichever of those is wrong is wrong silently, which is the
 * worst way for a redirect target to be wrong.
 *
 * So there is one answer now, and it is derived rather than guessed wherever
 * the environment can say. Note the literal `process.env.X` reads: Next only
 * inlines public env vars into the browser bundle when they appear as literal
 * member expressions, so these cannot be pulled from a passed-in `env` object.
 */

/**
 * Last resort, used only when nothing in the environment says otherwise. This
 * is the project's production domain on Vercel -- if a custom domain is ever
 * attached, set NEXT_PUBLIC_APP_URL rather than editing this.
 */
export const DEFAULT_APP_URL = "https://ticket-system-sigma-pink.vercel.app";

const CONFIGURED_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
/** Vercel injects this on every deployment, so previews link to themselves. */
const VERCEL_URL = process.env.NEXT_PUBLIC_VERCEL_URL;

/**
 * Trims a trailing slash and supplies the scheme Vercel's `*_VERCEL_URL`
 * omits, so callers can concatenate a path without producing `//` or a
 * protocol-less URL that `new URL()` rejects.
 */
export function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Resolves the origin for server-rendered links: canonical metadata, the
 * sitemap, the auth callback, and the redirect target baked into invitation
 * emails.
 *
 * `overrides` exists for tests; production always reads the module-level
 * constants above.
 */
export function appUrl(overrides?: { configured?: string; vercel?: string }): string {
  const configured = overrides ? overrides.configured : CONFIGURED_APP_URL;
  if (configured) {
    const normalized = normalizeOrigin(configured);
    if (normalized) return normalized;
  }

  const vercel = overrides ? overrides.vercel : VERCEL_URL;
  if (vercel) {
    const normalized = normalizeOrigin(vercel);
    if (normalized) return normalized;
  }

  return DEFAULT_APP_URL;
}

/**
 * The origin to send an emailed auth link back to, from inside the browser.
 *
 * Deliberately different from `appUrl()`: a PKCE link only works in the browser
 * that requested it, because the code verifier is a cookie scoped to *this*
 * origin. Naming any other origin -- a stale env var, a production URL read
 * from a preview deployment -- sends the person to a browser context with no
 * verifier, and the exchange fails with the code sitting right there in the
 * URL. `window.location.origin` cannot drift.
 *
 * Falls back to `appUrl()` if ever called during SSR, where there is no window.
 */
export function browserOrigin(): string {
  if (typeof window === "undefined") return appUrl();
  return normalizeOrigin(window.location.origin);
}
