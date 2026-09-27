/**
 * Paths the middleware must hand straight to Next, without locale rewriting or
 * the authentication gate.
 *
 * Metadata routes are the easy ones to forget: `app/robots.ts`,
 * `app/sitemap.ts` and `app/icon.tsx` look like pages to the auth gate, so an
 * anonymous crawler asking for /robots.txt used to be redirected to /login --
 * as was every browser asking for the favicon. Keep this list and the
 * `config.matcher` in middleware.ts in step; the matcher is a static literal
 * and cannot import it.
 */
const METADATA_ROUTES = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/icon",
  "/favicon.ico",
]);

const STATIC_ASSET = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/;

export function bypassesMiddleware(path: string): boolean {
  return (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    METADATA_ROUTES.has(path) ||
    STATIC_ASSET.test(path)
  );
}
