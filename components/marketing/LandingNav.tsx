"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Zap } from "lucide-react";

const LOCALE_LABELS: Record<string, string> = { de: "DE", en: "EN", es: "ES" };

interface LandingNavProps {
  locale: string;
}

export function LandingNav({ locale }: LandingNavProps) {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const loginHref = locale === "de" ? "/login" : `/${locale}/login`;

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
            {routing.locales.map((l) => (
              <button
                key={l}
                onClick={() => router.replace(pathname, { locale: l })}
                className={[
                  "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  l === currentLocale
                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
                ].join(" ")}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>

          {/* Login */}
          <Link
            href={loginHref}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {locale === "de" ? "Anmelden" : locale === "es" ? "Iniciar sesión" : "Sign in"}
          </Link>

          {/* CTA */}
          <a
            href="#pricing"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-500/20"
          >
            {locale === "de" ? "Kostenlos testen" : locale === "es" ? "Prueba gratis" : "Start free trial"}
          </a>
        </div>
      </div>
    </header>
  );
}
