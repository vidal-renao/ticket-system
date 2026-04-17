import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en", "es"] as const,
  defaultLocale: "de",
  localePrefix: "as-needed", // /login (de), /en/login, /es/login
});

export type Locale = (typeof routing.locales)[number];
