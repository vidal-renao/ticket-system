"use client";

import Link from "next/link";
import { ArrowUpRight, RadioTower } from "lucide-react";

const LOCALE_HREFS: Record<string, string> = { de: "/", en: "/en", es: "/es" };
const LOGIN_LABELS: Record<string, string> = { de: "Anmelden", en: "Sign in", es: "Iniciar sesión" };
const CTA_LABELS: Record<string, string> = { de: "Demo anfordern", en: "Request demo", es: "Solicitar demo" };
const DASHBOARD_LABELS: Record<string, string> = { de: "Zum Dashboard", en: "Open dashboard", es: "Abrir panel" };

interface LandingNavProps {
  locale: string;
  isLoggedIn?: boolean;
}

export function LandingNav({ locale, isLoggedIn = false }: LandingNavProps) {
  const loginHref = locale === "de" ? "/login" : `/${locale}/login`;
  const dashboardHref = locale === "de" ? "/dashboard" : `/${locale}/dashboard`;
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contact@vidallab.ch";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#07101d]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href={LOCALE_HREFS[locale] ?? "/"} className="group flex items-center gap-3" aria-label="HelpDesk AI home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-brand-400)]/25 bg-[var(--color-brand-500)]/12 text-[var(--color-brand-200)] transition-colors group-hover:bg-[var(--color-brand-500)]/20">
            <RadioTower className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.01em]">HelpDesk AI</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Support operations</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden items-center rounded-lg border border-white/8 bg-white/[0.025] p-1 sm:flex" aria-label="Language">
            {(["de", "en", "es"] as const).map((language) => (
              <Link
                key={language}
                href={LOCALE_HREFS[language]}
                aria-current={language === locale ? "page" : undefined}
                className={language === locale
                  ? "rounded-md bg-[var(--color-surface-700)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--color-text-primary)]"
                  : "rounded-md px-2 py-1 font-mono text-[10px] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}
              >
                {language}
              </Link>
            ))}
          </div>

          {!isLoggedIn && (
            <Link href={loginHref} className="hidden text-xs font-medium text-[var(--color-text-secondary)] hover:text-white sm:inline-flex">
              {LOGIN_LABELS[locale] ?? LOGIN_LABELS.en}
            </Link>
          )}

          <a
            href={isLoggedIn ? dashboardHref : `mailto:${contactEmail}?subject=HelpDesk%20AI%20product%20demo`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-400)]"
          >
            {isLoggedIn ? DASHBOARD_LABELS[locale] ?? DASHBOARD_LABELS.en : CTA_LABELS[locale] ?? CTA_LABELS.en}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}
