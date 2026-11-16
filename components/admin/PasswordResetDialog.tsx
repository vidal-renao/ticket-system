"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, MailCheck, MailWarning, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * What came back from starting a recovery for somebody else.
 *
 * `emailSent` is reported rather than assumed: Resend is only configured in
 * some environments and can refuse a send outright. The link itself is shown
 * only when the mail did NOT go and the deployment runs with
 * ADMIN_LINK_HANDOFF=true (DECISIONS.md ADR-016); otherwise `actionLink` is
 * null and the dialog states the email status alone.
 */
export interface PasswordResetOutcome {
  name: string;
  email: string;
  actionLink: string | null;
  emailSent: boolean;
}

export function PasswordResetDialog({
  outcome,
  onClose,
}: {
  outcome: PasswordResetOutcome | null;
  onClose: () => void;
}) {
  const t = useTranslations("admin.linkHandoff");
  const [copied, setCopied] = useState(false);

  if (!outcome) return null;

  async function copy() {
    if (!outcome?.actionLink) return;
    try {
      await navigator.clipboard.writeText(outcome.actionLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the link is on screen and selectable anyway.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-reset-title"
        className="w-full max-w-lg rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2">
            <KeyRound className="h-5 w-5 text-indigo-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="password-reset-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              {t("resetTitle", { name: outcome.name })}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{outcome.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-lg p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {outcome.emailSent ? (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-[var(--color-surface-800)] p-3 text-sm text-[var(--color-text-secondary)]">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{t("resetEmailSent")}</span>
          </p>
        ) : (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-[var(--color-surface-800)] p-3 text-sm text-[var(--color-text-secondary)]">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>{outcome.actionLink ? t("resetHandoff") : t("resetEmailFailedNoLink")}</span>
          </p>
        )}

        {outcome.actionLink && (
          <p className="mt-3 break-all rounded-lg bg-[var(--color-surface-800)] px-3 py-2 font-mono text-[11px] text-[var(--color-text-primary)]">
            {outcome.actionLink}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {outcome.actionLink && (
            <Button type="button" size="sm" variant="secondary" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copyLink")}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("done")}
          </Button>
        </div>

        {(outcome.emailSent || outcome.actionLink) && (
          <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">{t("resetExpiry")}</p>
        )}
      </div>
    </div>
  );
}
