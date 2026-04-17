import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.vidallab.ch";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales;

  const loginRoutes = locales.map((locale) => ({
    url: locale === routing.defaultLocale
      ? `${BASE_URL}/login`
      : `${BASE_URL}/${locale}/login`,
    lastModified: new Date(),
    changeFrequency: "yearly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...loginRoutes,
  ];
}
