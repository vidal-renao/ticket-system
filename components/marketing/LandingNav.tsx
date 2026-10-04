"use client";

import Link from "next/link";
import { ArrowUpRight, Zap } from "lucide-react";
import { publicContact } from "@/lib/public-contact";

const LOCALE_HREFS: Record<string, string> = { de: "/", en: "/en", es: "/es" };
const LOGIN_LABELS: Record<string, string> = { de: "Anmelden", en: "Sign in", es: "Iniciar sesión" };
const DEMO_LABELS: Record<string, string> = { de: "Demo anfordern", en: "Request demo", es: "Solicitar demo" };
const CONTACT_LABELS: Record<string, string> = { de: "Kontakt aufnehmen", en: "Get in touch", es: "Contactar" };
const DASHBOARD_LABELS: Record<string, string> = { de: "Zum Dashboard", en: "Open dashboard", es: "Abrir panel" };
const LANGUAGE_LABELS: Record<string, string> = { de: "Sprache", en: "Language", es: "Idioma" };

interface LandingNavProps {
  locale: string;
  isLoggedIn?: boolean;
}

export function LandingNav({ locale, isLoggedIn = false }: LandingNavProps) {
  const loginHref = locale === "de" ? "/login" : `/${locale}/login`;
  const dashboardHref = locale === "de" ? "/dashboard" : `/${locale}/dashboard`;
  const contact = publicContact();
  const contactLabels = contact.kind === "email" ? DEMO_LABELS : CONTACT_LABELS;
  const ctaLabel = isLoggedIn
    ? DASHBOARD_LABELS[locale] ?? DASHBOARD_LABELS.en
    : contactLabels[locale] ?? contactLabels.en;
  const opensProfile = !isLoggedIn && contact.kind === "profile";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#07101d]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link href={LOCALE_HREFS[locale] ?? "/"} className="group flex items-center gap-3" aria-label="HelpDesk AI home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-500)] text-white transition-colors group-hover:bg-[var(--color-brand-400)]">
            <Zap className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.01em]">HelpDesk AI</span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-text-muted)] min-[420px]:block">Support operations</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex items-center rounded-lg border border-white/8 bg-white/[0.025] p-0.5" aria-label={LANGUAGE_LABELS[locale] ?? LANGUAGE_LABELS.en}>
            {(["de", "en", "es"] as const).map((language) => (
              <Link
                key={language}
                href={LOCALE_HREFS[language]}
                hrefLang={language}
                lang={language}
                aria-current={language === locale ? "page" : undefined}
                className={`inline-flex min-h-7 min-w-8 items-center justify-center rounded-md px-2 font-mono text-[11px] uppercase ${
                  language === locale
                    ? "bg-[var(--color-surface-700)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {language}
              </Link>
            ))}
          </nav>

          {!isLoggedIn && (
            <Link href={loginHref} className="hidden min-h-9 items-center text-xs font-medium text-[var(--color-text-secondary)] hover:text-white sm:inline-flex">
              {LOGIN_LABELS[locale] ?? LOGIN_LABELS.en}
            </Link>
          )}

          {/* Hidden below sm: the hero's primary CTA is above the fold there,
              and the language switcher needs the room. */}
          <a
            href={isLoggedIn ? dashboardHref : contact.href}
            {...(opensProfile ? { target: "_blank", rel: "noreferrer" } : {})}
            className="hidden min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-brand-400)] sm:inline-flex"
          >
            {ctaLabel}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}
