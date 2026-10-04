import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINKEDIN_URL, publicContact } from "../../lib/public-contact";
import { bypassesMiddleware } from "../../lib/public-paths";
import { AUTH_SCREEN_ROBOTS, landingMetadata, localeAlternates } from "../../lib/seo";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";

describe("where the landing contact button goes", () => {
  it("uses a configured mailbox as a demo request", () => {
    expect(publicContact({ email: " hello@example.ch " })).toEqual({
      kind: "email",
      href: "mailto:hello@example.ch?subject=HelpDesk%20AI%20product%20demo",
    });
  });

  it("falls back to the public profile when no mailbox is configured", () => {
    // The regression: an unset variable used to produce a mailto for a domain
    // that does not exist, so every demo request bounced.
    expect(publicContact({})).toEqual({ kind: "profile", href: LINKEDIN_URL });
  });

  it("never renders a malformed address", () => {
    expect(publicContact({ email: "not-an-address" })).toEqual({ kind: "profile", href: LINKEDIN_URL });
  });

  it("accepts an https contact page and rejects anything else", () => {
    expect(publicContact({ url: "https://example.ch/contact" })).toEqual({
      kind: "profile",
      href: "https://example.ch/contact",
    });
    expect(publicContact({ url: "javascript:alert(1)" }).href).toBe(LINKEDIN_URL);
    expect(publicContact({ url: "http://example.ch" }).href).toBe(LINKEDIN_URL);
  });
});

describe("what the middleware lets through untouched", () => {
  it.each(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/icon", "/favicon.ico", "/api/health", "/_next/static/x.js", "/logo.png"])(
    "bypasses %s",
    (path) => expect(bypassesMiddleware(path)).toBe(true)
  );

  it.each(["/", "/login", "/dashboard", "/en/tickets/42", "/icons", "/robots.txt.bak"])(
    "still gates %s",
    (path) => expect(bypassesMiddleware(path)).toBe(false)
  );

  it("keeps the static matcher in step with the helper", () => {
    const source = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
    for (const route of ["robots.txt", "sitemap.xml", "manifest.webmanifest", "icon$", "favicon.ico"]) {
      expect(source).toContain(`|${route}|`);
    }
  });
});

describe("what crawlers are told", () => {
  it("points robots at this deployment's sitemap and keeps private sections out", () => {
    const result = robots();
    expect(result.sitemap).toMatch(/^https:\/\/[^/]+\/sitemap\.xml$/);
    expect(result.sitemap).not.toContain("vidallab.ch");
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/api/", "/de/dashboard", "/en/queue", "/es/tickets/"]));
  });

  it("lists only the public landing pages, each with its language alternates", () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);
    expect(paths).toEqual(["/", "/en", "/es"]);
    for (const entry of entries) {
      expect(Object.keys(entry.alternates?.languages ?? {})).toEqual(["de", "en", "es", "x-default"]);
    }
  });

  it("canonicalises each landing locale to its root", () => {
    expect(localeAlternates()).toEqual({ de: "/", en: "/en", es: "/es", "x-default": "/" });
    expect(landingMetadata("en").alternates?.canonical).toBe("/en");
    expect(landingMetadata("de").alternates?.canonical).toBe("/");
  });

  it("keeps sign-in screens out of search results", () => {
    expect(AUTH_SCREEN_ROBOTS).toEqual({ index: false, follow: true });
  });
});
