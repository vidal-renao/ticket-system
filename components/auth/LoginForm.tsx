"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

interface LoginFormProps {
  error?: string;
}

export function LoginForm({ error }: LoginFormProps) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (error) toast.error(decodeURIComponent(error));
  }, [error]);

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });

      let json: { redirectTo?: string; error?: string };
      try {
        json = await res.json();
      } catch {
        toast.error(t("errorServer"));
        setPending(false);
        return;
      }

      if (!res.ok) {
        toast.error(json.error || "Login failed");
        setPending(false);
        return;
      }

      const { redirectTo, error: apiError } = json;
      if (apiError) {
        toast.error(apiError);
        setPending(false);
        return;
      }

      // Hard navigate so the browser sends the freshly-set session cookies
      window.location.href = redirectTo ?? "/dashboard";
    } catch {
      toast.error(t("errorNetwork"));
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      action="/api/auth/login"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="p-5 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("email")}
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@company.ch"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("password")}
          </label>
          <input
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className={inputClass}
          />
        </div>
      </div>

      <Button type="submit" loading={pending} className="w-full">
        {t("signIn")}
      </Button>
    </form>
  );
}
