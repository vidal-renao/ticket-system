"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { translateText } from "@/app/actions/translate-text";
import { toast } from "sonner";

const LOCALE_LABELS: Record<string, string> = {
  de: "DE",
  en: "EN",
  es: "ES",
  fr: "FR",
  it: "IT",
};

interface TranslateButtonProps {
  text: string;
  targetLocale: string;
  /** Optional class on the outer wrapper */
  className?: string;
}

export function TranslateButton({ text, targetLocale, className }: TranslateButtonProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  async function handleClick() {
    // Toggle cached translation without re-calling Claude
    if (translation) {
      setVisible((v) => !v);
      return;
    }
    setLoading(true);
    const result = await translateText(text, targetLocale);
    if ("error" in result) {
      toast.error(`Translation failed: ${result.error}`);
    } else {
      setTranslation(result.translation);
      setVisible(true);
    }
    setLoading(false);
  }

  const label = LOCALE_LABELS[targetLocale] ?? targetLocale.toUpperCase();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-indigo-400 disabled:opacity-50 transition-colors"
      >
        <Globe className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Translating…" : visible ? "Hide translation" : `Translate → ${label}`}
      </button>

      {visible && translation && (
        <div className="mt-2 text-sm italic text-[var(--color-text-secondary)] leading-relaxed px-3 py-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
          {translation}
        </div>
      )}
    </div>
  );
}
