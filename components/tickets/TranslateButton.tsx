"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

const LANGS = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
] as const;

interface TranslateButtonProps {
  text: string;
  className?: string;
}

export function TranslateButton({ text, className }: TranslateButtonProps) {
  const [cache, setCache] = useState<Record<string, string>>({});
  const [loadingLang, setLoadingLang] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<string | null>(null);

  async function handleClick(lang: string) {
    if (activeLang === lang) {
      setActiveLang(null);
      return;
    }
    if (cache[lang]) {
      setActiveLang(lang);
      return;
    }
    setLoadingLang(lang);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage: lang }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(`Translation failed: ${data.error ?? "Unknown error"}`);
        return;
      }
      setCache((prev) => ({ ...prev, [lang]: data.translatedText }));
      setActiveLang(lang);
    } catch {
      toast.error("Translation failed");
    } finally {
      setLoadingLang(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <Globe className="w-3 h-3 text-[var(--color-text-muted)]" />
        {LANGS.map(({ code, label }) => {
          const isActive = activeLang === code;
          const isLoading = loadingLang === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => handleClick(code)}
              disabled={loadingLang !== null}
              className={`flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all ${
                isActive
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-[var(--color-surface-800)] border-[var(--color-surface-600)] text-[var(--color-text-muted)] hover:text-indigo-400 hover:border-indigo-500/30"
              } disabled:opacity-50`}
            >
              {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : label}
            </button>
          );
        })}
      </div>

      {activeLang && cache[activeLang] && (
        <div className="mt-2 text-sm italic text-[var(--color-text-secondary)] leading-relaxed px-3 py-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
          {cache[activeLang]}
        </div>
      )}
    </div>
  );
}
