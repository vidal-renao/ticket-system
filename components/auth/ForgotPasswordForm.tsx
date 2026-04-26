"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ticket-system-sigma-pink.vercel.app";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${APP_URL}/reset-password`,
      });

      if (error) {
        toast.error(error.message || t("forgotPasswordError"), { duration: 6000 });
      } else {
        setSent(true);
        toast.success(t("forgotPasswordSuccess"), { duration: 6000 });
      }
    } catch {
      toast.error(t("forgotPasswordError"), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <p className="text-sm text-emerald-300">{t("forgotPasswordSuccess")}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">{email}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-5">
        <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
          {t("email")}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>

      <Button type="submit" loading={loading} className="w-full">
        {t("forgotPasswordSubmit")}
      </Button>
    </form>
  );
}
