"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS: Record<string, string> = { de: "DE", en: "EN", es: "ES" };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function handleChange(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div
      role="group"
      aria-label="Language selection"
      className="flex items-center gap-1 px-3 py-1.5"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => handleChange(l)}
          aria-pressed={l === locale}
          aria-label={`Switch language to ${LOCALE_LABELS[l]}`}
          className={[
            "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors",
            l === locale
              ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
          ].join(" ")}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
