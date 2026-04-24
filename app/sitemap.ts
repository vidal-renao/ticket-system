import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.vidallab.ch";
const LOCALES = ["de", "en", "es"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const publicRoutes = ["", "/home", "/login", "/register"] as const;
  const appRoutes = ["/tickets", "/queue", "/dashboard"] as const;

  return LOCALES.flatMap((locale) => {
    const prefix = locale === "de" ? "" : `/${locale}`;

    return [...publicRoutes, ...appRoutes].map((route) => ({
      url: `${BASE_URL}${prefix}${route}`,
      lastModified: new Date(),
      changeFrequency: route === "" ? "weekly" : "daily",
      priority: route === "" ? 1 : route === "/login" || route === "/register" ? 0.6 : 0.8,
    }));
  });
}
