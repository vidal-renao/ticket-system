"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setPiiScrubbing } from "@/app/actions/org-settings";

interface PIIScrubbingToggleProps {
  enabled: boolean;
}

export function PIIScrubbingToggle({ enabled: initial }: PIIScrubbingToggleProps) {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    const next = !enabled;
    setLoading(true);
    const result = await setPiiScrubbing(next);
    if ("error" in result) {
      toast.error(t("saveError"));
    } else {
      setEnabled(next);
      toast.success(t("saved"));
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle PII Scrubbing"
      onClick={handleToggle}
      disabled={loading}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: enabled ? "rgb(79 70 229)" : "var(--color-surface-600)" }}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
