"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { LoginDebugPanel } from "@/components/auth/LoginDebugPanel";

interface LoginDiagnostic {
  stage?: string;
  authErrorName?: string | null;
  authErrorStatus?: number | null;
  authErrorCode?: string | null;
  profileFound?: boolean;
  profileRole?: string | null;
  organizationId?: string | null;
  sessionPresent?: boolean;
  cookieCount?: number;
  redirectTo?: string | null;
}

interface LoginFormProps {
  error?: string;
  debug?: boolean;
}

export function LoginForm({ error, debug = false }: LoginFormProps) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<LoginDiagnostic | null>(null);

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

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setDiagnostic(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });

      let json: {
        redirectTo?: string;
        error?: string;
        diagnostic?: LoginDiagnostic;
      };

      try {
        json = await response.json();
      } catch {
        toast.error(t("errorServer"));
        setPending(false);
        return;
      }

      if (json.diagnostic) setDiagnostic(json.diagnostic);

      if (!response.ok) {
        toast.error(json.error || "Login failed");
        setPending(false);
        return;
      }

      if (json.error) {
        toast.error(json.error);
        setPending(false);
        return;
      }

      window.location.href = json.redirectTo ?? "/dashboard";
    } catch {
      toast.error(t("errorNetwork"));
      setPending(false);
    }
  }

  return (
    <form method="post" action="/api/auth/login" onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{t("email")}</label>
          <input name="email" type="email" placeholder="you@company.ch" required className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{t("password")}</label>
          <input name="password" type="password" placeholder="••••••••" required className={inputClass} />
        </div>
      </div>

      <Button type="submit" loading={pending} className="w-full">
        {t("signIn")}
      </Button>

      {debug && <LoginDebugPanel diagnostic={diagnostic} />}
    </form>
  );
}
