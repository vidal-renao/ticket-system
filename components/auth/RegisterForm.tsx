"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

export function RegisterForm() {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<"employee" | "customer">("employee");

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      name:     (fd.get("name") as string)?.trim(),
      email:    (fd.get("email") as string)?.trim(),
      password: fd.get("password") as string,
      org_code: (fd.get("org_code") as string)?.trim(),
      role,
    };

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json: { redirectTo?: string; needsConfirmation?: boolean; error?: string };
      try { json = await res.json(); } catch {
        toast.error(t("errorServer"));
        setPending(false);
        return;
      }

      if (!res.ok) {
        toast.error(json.error || t("errorGeneric"));
        setPending(false);
        return;
      }

      if (json.needsConfirmation) {
        toast.success(t("registerConfirmEmail"));
        window.location.href = "/login";
        return;
      }

      if (json.redirectTo) {
        window.location.href = json.redirectTo;
        return;
      }
    } catch {
      toast.error(t("errorNetwork"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-5 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] space-y-4">
        {/* Full name */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("fullName")}
          </label>
          <input name="name" type="text" placeholder={t("fullNamePlaceholder")} required className={inputClass} />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("email")}
          </label>
          <input name="email" type="email" placeholder="you@company.ch" required className={inputClass} />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("password")}
          </label>
          <input name="password" type="password" placeholder="••••••••" required minLength={6} className={inputClass} />
        </div>

        {/* Org code */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("orgCode")}
          </label>
          <input
            name="org_code"
            type="text"
            placeholder={t("orgCodePlaceholder")}
            required
            className={inputClass}
            style={{ fontFamily: "monospace" }}
          />
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{t("orgCodeHint")}</p>
        </div>

        {/* Role selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            {t("selectRole")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["employee", "customer"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  role === r
                    ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/30"
                    : "bg-[var(--color-surface-800)] text-[var(--color-text-secondary)] border-[var(--color-surface-600)] hover:bg-[var(--color-surface-700)]"
                }`}
              >
                {r === "employee" ? t("roleEmployee") : t("roleCustomer")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button type="submit" loading={pending} className="w-full">
        {t("createAccount")}
      </Button>

      <p className="text-center text-xs text-[var(--color-text-muted)]">
        {t("alreadyHaveAccount")}{" "}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
