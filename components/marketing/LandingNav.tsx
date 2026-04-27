"use client";

import Link from "next/link";
import { Zap, ChevronRight } from "lucide-react";

const LOCALE_HREFS: Record<string, string> = { de: "/", en: "/en", es: "/es" };
const LOGIN_LABELS: Record<string, string> = { de: "Anmelden", en: "Sign in", es: "Iniciar sesión" };
const CTA_LABELS: Record<string, string> = { de: "Demo anfordern", en: "Request demo", es: "Solicitar demo" };
const DASHBOARD_LABELS: Record<string, string> = { de: "Zum Dashboard", en: "Go to Dashboard", es: "Ir al Panel" };

interface LandingNavProps {
  locale: string;
  isLoggedIn?: boolean;
}

export function LandingNav({ locale, isLoggedIn = false }: LandingNavProps) {
  const loginHref = locale === "de" ? "/login" : `/${locale}/login`;
  const dashboardHref = locale === "de" ? "/dashboard" : `/${locale}/dashboard`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 backdrop-blur-md bg-[#080b12]/80">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">HelpDesk AI</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Locale switcher */}
          <div className="flex items-center gap-1">
            {(["de", "en", "es"] as const).map((l) => (
              <Link
                key={l}
                href={LOCALE_HREFS[l]}
                className={[
                  "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  l === locale
                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
                ].join(" ")}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>

          {/* Login */}
          <Link
            href={loginHref}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {LOGIN_LABELS[locale] ?? "Sign in"}
          </Link>

          {/* CTA */}
          {isLoggedIn ? (
            <Link
              href={dashboardHref}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-500/20"
            >
              {DASHBOARD_LABELS[locale] ?? "Dashboard"}
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <a
              href="mailto:htcpacoxo31@gmail.com?subject=HelpDesk AI Demo"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-500/20"
            >
              {CTA_LABELS[locale] ?? "Request demo"}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
