"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MailWarning } from "lucide-react";
import { createRecoveryClient } from "@/lib/supabase/client";
import {
  classifyRecoveryFailure,
  landingAfterReset,
  readRecoveryCredentials,
  type RecoveryFlow,
  type RecoveryLinkState,
} from "@/lib/auth-recovery-link";
import { normalizeSupabaseErrorMessage, passwordSchema } from "@/lib/validation/security";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState<RecoveryLinkState>("checking");
  const [flow, setFlow] = useState<RecoveryFlow>("recovery");
  const clientRef = useRef<SupabaseClient | null>(null);

  /**
   * Redeem the link immediately, before anyone is asked to think about a
   * password.
   *
   * GoTrue gives a recovery flow five minutes from the click, and choosing a
   * password takes longer than that more often than it doesn't. Spending the
   * window here, on mount, costs a second; spending it in the submit handler
   * cost a person eight minutes and a 422. Nobody is shown the form until
   * there is a session to spend it on.
   */
  useEffect(() => {
    let cancelled = false;
    const supabase = createRecoveryClient();
    clientRef.current = supabase;

    /** The code has been spent -- keep it out of the URL, history and referers. */
    function scrubUrl() {
      window.history.replaceState({}, "", window.location.pathname);
    }

    async function redeem() {
      const credentials = readRecoveryCredentials({
        search: window.location.search,
        hash: window.location.hash,
      });

      if (credentials.kind !== "error" && credentials.kind !== "none") {
        setFlow(credentials.flow);
      }

      switch (credentials.kind) {
        case "pkce": {
          const { error } = await supabase.auth.exchangeCodeForSession(credentials.code);
          if (cancelled) return;
          if (error) {
            setState(classifyRecoveryFailure(error));
            return;
          }
          scrubUrl();
          setState("ready");
          return;
        }

        case "implicit": {
          const { error } = await supabase.auth.setSession({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
          });
          if (cancelled) return;
          if (error) {
            setState(classifyRecoveryFailure(error));
            return;
          }
          scrubUrl();
          setState("ready");
          return;
        }

        case "error": {
          if (cancelled) return;
          setState(
            classifyRecoveryFailure({
              code: credentials.errorCode,
              message: credentials.message,
            })
          );
          return;
        }

        case "none": {
          // No link, but not necessarily nobody: a reload after a successful
          // exchange lands here with a clean URL and a session in cookies, and
          // so does a signed-in person changing their own password.
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          setState(data.session ? "ready" : "invalid");
          return;
        }
      }
    }

    void redeem();
    return () => {
      cancelled = true;
    };
  }, []);

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors pr-10",
  ].join(" ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? t("passwordTooShort"), { duration: 5000 });
      return;
    }
    if (password !== confirm) {
      toast.error(t("passwordMismatch"), { duration: 5000 });
      return;
    }

    const supabase = clientRef.current;
    if (!supabase) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // The session was there a moment ago, so a failure now is either the
        // password itself or an hour-old session. Send the second case back to
        // the link screen rather than leaving them retyping into a dead form.
        if (classifyRecoveryFailure(error) === "expired") {
          setState("expired");
          return;
        }
        toast.error(normalizeSupabaseErrorMessage(error), { duration: 6000 });
      } else {
        toast.success(t("resetPasswordSuccess"), { duration: 4000 });
        setTimeout(() => {
          // A full navigation, not a router push: the session was just written
          // to cookies by the browser client, and the middleware has to read
          // it on the next request for /tickets not to bounce to /login.
          window.location.href = landingAfterReset(flow);
        }, 2000);
      }
    } catch {
      toast.error(t("resetPasswordError"), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }

  if (state === "checking") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-6 text-center"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" aria-hidden="true" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t("resetPasswordChecking")}</p>
      </div>
    );
  }

  if (state === "expired" || state === "invalid") {
    return (
      <div className="space-y-4">
        {/* The surface and text tokens, not amber-on-amber: the card is glass
            and goes light or dark with the viewer, and a tinted panel that
            reads on one of those washes out on the other. Amber stays on the
            border and the icon, where contrast does not carry the message. */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/40 bg-[var(--color-surface-900)] p-6 text-center">
          <MailWarning className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {state === "expired" ? t("resetPasswordExpired") : t("resetPasswordInvalid")}
          </p>
        </div>
        <a
          href="../forgot-password"
          className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          {t("resetPasswordRequestNew")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)] -mt-4 mb-4 text-center">
        {t("resetPasswordSubtitle")}
      </p>

      <div className="space-y-4 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-5">
        {/* New password */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
            {t("newPassword")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              required
              autoComplete="new-password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <PasswordStrengthMeter password={password} className="mt-2" />
        </div>

        {/* Confirm password */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
            {t("confirmPassword")}
          </label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              required
              autoComplete="new-password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              aria-label={showConfirm ? t("hidePassword") : t("showPassword")}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirm.length > 0 && password !== confirm && (
            <p className="mt-1 text-xs text-red-400">{t("passwordMismatch")}</p>
          )}
        </div>
      </div>

      <Button type="submit" loading={loading} className="w-full" disabled={password !== confirm && confirm.length > 0}>
        {t("resetPasswordSubmit")}
      </Button>
    </form>
  );
}
