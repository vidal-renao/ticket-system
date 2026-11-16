"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * The two screens that appear when an address already has an account on this
 * shared instance. Both customer forms show them identically, so they live
 * here rather than being written twice and drifting.
 */

/**
 * Shown before anything is written. The admin is adopting an account created
 * by another application, which is not something to do by accident, so it
 * takes a second deliberate click -- the same shape as the emergency close.
 */
export function LinkExistingAccountPrompt({
  email,
  message,
  loading,
  onConfirm,
  onCancel,
}: {
  email: string;
  message: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="link-existing-title"
      aria-describedby="link-existing-desc"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6"
    >
      <p id="link-existing-title" className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        That address already has an account
      </p>
      <p id="link-existing-desc" className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {message}
      </p>
      <p className="mt-3 rounded-lg bg-[var(--color-surface-900)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
        {email}
      </p>
      <div className="mt-5 flex gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
          Use a different address
        </Button>
        <Button type="button" onClick={onConfirm} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Link this account
        </Button>
      </div>
    </div>
  );
}

/**
 * What the admin is told after an onboarding, and -- in exactly one case --
 * the invitation link itself.
 *
 * A link appears only when the invitation email could not be sent and the
 * deployment runs with ADMIN_LINK_HANDOFF=true (DECISIONS.md ADR-016). A
 * linked account never gets one: it already has credentials. Otherwise the
 * email is the delivery, and the admin is told its real status instead of
 * being handed a second way in.
 */
export function AccessLinkNotice({
  linked,
  accessLink,
}: {
  linked: boolean;
  accessLink: string | null;
}) {
  const t = useTranslations("admin.linkHandoff");
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!accessLink) return;
    try {
      await navigator.clipboard.writeText(accessLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the link is on screen and selectable anyway.
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-4 text-left">
      <p className="text-xs text-[var(--color-text-secondary)]" role="status">
        {linked ? t("linkedNotice") : accessLink ? t("inviteHandoffNotice") : t("invitedNotice")}
      </p>

      {!linked && accessLink && (
        <>
          <p className="mt-3 break-all rounded-lg bg-[var(--color-surface-800)] px-3 py-2 font-mono text-[11px] text-[var(--color-text-primary)]">
            {accessLink}
          </p>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t("copied") : t("copyInviteLink")}
          </Button>
        </>
      )}
    </div>
  );
}
