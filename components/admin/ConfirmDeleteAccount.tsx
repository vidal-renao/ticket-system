"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * The typed confirmation for closing or reopening an account.
 *
 * The same shape as the ticket cockpit's cleanup, deliberately: those are the
 * two places where an administrator removes something and can put it back, and
 * a person who has learned one should not have to learn the other.
 *
 * What it says out loud matters more than the typing. Nothing is destroyed --
 * every comment, ticket and audit row survives and keeps naming this person --
 * and an administrator who believes otherwise will hesitate over the button
 * for the wrong reason, or press it expecting an erasure they are not getting.
 */
export function ConfirmDeleteAccount({
  name,
  action,
  pending,
  onConfirm,
  onCancel,
}: {
  name: string;
  action: "delete" | "restore";
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const expected = action.toUpperCase();
  const ready = typed === expected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-account-title"
        aria-describedby="confirm-account-desc"
        className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl shadow-black/60 ${
          action === "delete"
            ? "border-red-500/40 bg-[var(--color-surface-900)]"
            : "border-emerald-500/40 bg-[var(--color-surface-900)]"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2 ${action === "delete" ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
            {action === "delete" ? (
              <Trash2 className="h-5 w-5 text-red-400" aria-hidden="true" />
            ) : (
              <Undo2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-account-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              {action === "delete" ? "Delete" : "Restore"} {name}
            </h2>
            <div id="confirm-account-desc" className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]">
              {action === "delete" ? (
                <>
                  <p>
                    The account disappears from every directory and can no longer sign in.
                  </p>
                  <p>
                    Nothing is erased. Their tickets, their comments and the audit trail all
                    stay exactly where they are and keep their name on them.
                  </p>
                </>
              ) : (
                <p>
                  The account comes back into the directory. It stays frozen — handing sign-in
                  back is a separate, deliberate step afterwards.
                </p>
              )}
            </div>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
            Type <span className="font-mono font-semibold text-[var(--color-text-primary)]">{expected}</span> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            aria-label={`Type ${expected} to confirm`}
            className="w-full rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
        </label>

        {action === "delete" && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
            Reversible from the “Deleted” filter in this directory.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={action === "delete" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={!ready || pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {action === "delete" ? "Delete account" : "Restore account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
