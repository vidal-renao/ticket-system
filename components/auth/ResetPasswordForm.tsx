"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeSupabaseErrorMessage, passwordSchema } from "@/lib/validation/security";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * This screen serves two arrivals, and they should not end the same way.
   *
   * A *recovery* link belongs to an existing account, so sending it back to
   * /login to sign in with the new password is a deliberate re-authentication.
   * An *invite* is the last step of creating an account: the person already
   * holds a valid session from the link, and a second login would be friction
   * for no security gain. So an invitee goes where any newly registered user
   * goes -- /tickets, matching POST /api/auth/register.
   *
   * The two are told apart by the URL. An invite arrives as an implicit grant
   * (#access_token=...&type=invite) because an admin-generated link has no
   * PKCE verifier in this browser; a recovery arrives as ?code=... and carries
   * no type. Read on mount, before the first createClient() call in the submit
   * handler consumes the fragment.
   */
  const [cameFromInvite, setCameFromInvite] = useState(false);

  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    if (!fragment) return;
    setCameFromInvite(new URLSearchParams(fragment).get("type") === "invite");
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

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(normalizeSupabaseErrorMessage(error), { duration: 6000 });
      } else {
        toast.success(t("resetPasswordSuccess"), { duration: 4000 });
        setTimeout(() => {
          // A full navigation, not a router push: the session was just written
          // to cookies by the browser client, and the middleware has to read
          // it on the next request for /tickets not to bounce to /login.
          window.location.href = cameFromInvite ? "/tickets" : "/login";
        }, 2000);
      }
    } catch {
      toast.error(t("resetPasswordError"), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
