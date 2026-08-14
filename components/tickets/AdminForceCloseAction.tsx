"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { FORCE_CLOSE_REASON_MIN, FORCE_CLOSE_REASON_MAX } from "@/lib/force-close";

/**
 * The administrator's emergency exit from the chain of custody.
 *
 * Deliberately not part of TicketWorkflowActions: that component drives the
 * normal flow, and this is the thing you reach for when the normal flow cannot
 * express what happened. Keeping them apart also keeps this from being a
 * neighbour of the buttons an admin clicks every day.
 *
 * Two clicks and a written reason stand between the button and the close. The
 * server validates the reason again -- this is a courtesy to the admin, not
 * the enforcement.
 */
export function AdminForceCloseAction({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const t = useTranslations("ticket");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // Nothing to force on a ticket that is already at the end of its life.
  if (status === "closed") return null;

  const trimmed = reason.trim();
  const tooShort = trimmed.length < FORCE_CLOSE_REASON_MIN;

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tickets/${ticketId}/force-close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: trimmed }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? t("forceClose.failed"));

        // The close succeeded but the audit entry did not; the admin should
        // know their action is not on the record.
        if (data.audited === false) toast.warning(t("forceClose.notAudited"));
        else toast.success(t("forceClose.done"));

        setOpen(false);
        setReason("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("forceClose.failed"));
      }
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-[var(--color-text-muted)] hover:text-red-300"
      >
        <ShieldAlert className="h-4 w-4" /> {t("forceClose.action")}
      </Button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={`force-close-title-${ticketId}`}
      aria-describedby={`force-close-desc-${ticketId}`}
      className="rounded-xl border border-red-500/30 bg-red-500/5 p-3"
    >
      <p
        id={`force-close-title-${ticketId}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-red-300"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("forceClose.title")}
      </p>
      <p id={`force-close-desc-${ticketId}`} className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
        {t("forceClose.warning")}
      </p>

      <label htmlFor={`force-close-reason-${ticketId}`} className="mt-3 block text-[11px] font-medium text-[var(--color-text-secondary)]">
        {t("forceClose.reasonLabel")}
      </label>
      <textarea
        id={`force-close-reason-${ticketId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={FORCE_CLOSE_REASON_MAX}
        disabled={pending}
        placeholder={t("forceClose.reasonPlaceholder")}
        className="mt-1 w-full resize-none rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-red-500 focus:outline-none disabled:opacity-50"
      />
      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
        {t("forceClose.reasonHint", { min: FORCE_CLOSE_REASON_MIN })}
      </p>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} disabled={pending || tooShort}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("forceClose.confirm")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
          disabled={pending}
        >
          {t("forceClose.cancel")}
        </Button>
      </div>
    </div>
  );
}
