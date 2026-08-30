"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, MailCheck, MailWarning, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * What came back from starting a recovery for somebody else.
 *
 * `emailSent` is reported rather than assumed. Resend is only configured in
 * some environments and can refuse a send outright, and an administrator who
 * believes a mail went out will wait for one that never arrives -- the same
 * failure that left Alpen Logistics unreachable for a day. When the mail did
 * not go, the link on screen is the whole delivery mechanism, so it is shown
 * either way and the wording changes to match.
 */
export interface PasswordResetOutcome {
  name: string;
  email: string;
  actionLink: string;
  emailSent: boolean;
}

export function PasswordResetDialog({
  outcome,
  onClose,
}: {
  outcome: PasswordResetOutcome | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!outcome) return null;

  async function copy() {
    if (!outcome) return;
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
              Recovery link for {outcome.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{outcome.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {outcome.emailSent ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-[var(--color-surface-800)] p-3 text-sm text-[var(--color-text-secondary)]">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>The link was emailed. Below is the same link, in case it does not arrive.</span>
          </p>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-[var(--color-surface-800)] p-3 text-sm text-[var(--color-text-secondary)]">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              No email went out — outbound mail is not configured here. Hand this link over
              yourself, through a channel you trust.
            </span>
          </p>
        )}

        <p className="mt-3 break-all rounded-lg bg-[var(--color-surface-800)] px-3 py-2 font-mono text-[11px] text-[var(--color-text-primary)]">
          {outcome.actionLink}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>

        {/* Said out loud because an administrator handing over a link needs to
            know it does not wait for them. The reset screen offers a fresh one
            when it has gone stale, so this is a nuisance rather than a dead end. */}
        <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
          The link expires shortly after it is first opened. Their current password keeps
          working until a new one is set.
        </p>
      </div>
    </div>
  );
}
