"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  ticketId: string;
  resolvedAt: string | null;
}

const REOPEN_WINDOW_HOURS = 48;

/**
 * Shown to the company (customer) once an administrator has certified the
 * work as resolved. The company gives the final OK — closing the ticket — or
 * reopens it within the 48h window if the problem persists.
 */
export function CustomerResolutionActions({ ticketId, resolvedAt }: Props) {
  const t = useTranslations("ticket");
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "reopen" | null>(null);
  const [done, setDone] = useState(false);

  const hoursSinceResolved = resolvedAt
    ? (Date.now() - new Date(resolvedAt).getTime()) / 3_600_000
    : 0;
  const hoursLeft = Math.max(0, REOPEN_WINDOW_HOURS - hoursSinceResolved);
  const canReopen = Boolean(resolvedAt) && hoursLeft > 0;

  async function run(action: "confirm" | "reopen") {
    setPending(action);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (action === "confirm") {
        setDone(true);
        toast.success(t("confirmDone"));
      } else {
        toast.success("Ticket reopened");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4" />
        {t("confirmDone")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{t("confirmTitle")}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("confirmHint")}</p>
      </div>

      <button
        type="button"
        onClick={() => run("confirm")}
        disabled={pending !== null}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
      >
        {pending === "confirm" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" /> {t("confirmButton")}
          </>
        )}
      </button>

      {canReopen && (
        <button
          type="button"
          onClick={() => run("reopen")}
          disabled={pending !== null}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {pending === "reopen" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <RotateCcw className="w-4 h-4" /> {t("reopenHint")} ({Math.floor(hoursLeft)}h)
            </>
          )}
        </button>
      )}

      <p className="text-[10px] text-[var(--color-text-muted)]">{t("autoCloseNote")}</p>
    </div>
  );
}
