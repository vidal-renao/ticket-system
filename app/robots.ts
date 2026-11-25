import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { routing } from "@/i18n/routing";

// Generated rather than a static file so the Sitemap line follows the origin
// this deployment actually answers on. The static robots.txt this replaces
// pointed at helpdesk.vidallab.ch, a host that does not resolve.
const PRIVATE_SECTIONS = ["/dashboard", "/queue", "/tickets/"] as const;

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    ...routing.locales.flatMap((locale) =>
      PRIVATE_SECTIONS.map((section) => `/${locale}${section}`)
    ),
  ];

  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
