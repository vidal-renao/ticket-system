"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * Manual escape hatch for a ticket whose AI triage never landed. The cron
 * sweep picks these up within the hour; this is for an admin who does not want
 * to wait for it.
 */
export function ReanalyzeButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/reanalyze`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.error(body.error ?? t("aiReanalyzeFailed"));
        return;
      }
      toast.success(t("aiReanalyzeDone"));
      router.refresh();
    } catch {
      toast.error(t("aiReanalyzeFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={running}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-surface-600)] px-2 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand-400)]/50 hover:text-[var(--color-text-primary)] disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} aria-hidden="true" />
      {running ? t("aiReanalyzing") : t("aiReanalyze")}
    </button>
  );
}
