"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { registerSchema } from "@/lib/validation/security";

const INDUSTRIES = [
  "real_estate", "healthcare", "finance", "manufacturing",
  "retail", "hospitality", "technology", "construction", "education", "other",
] as const;

export function RegisterForm() {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [orgCode, setOrgCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

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
    const payload: Record<string, string> = {
      name:     (fd.get("name") as string)?.trim() ?? "",
      email:    (fd.get("email") as string)?.trim() ?? "",
      password: (fd.get("password") as string) ?? "",
      org_code: orgCode.trim(),
      role: "customer",
    };
    payload.company_name = (fd.get("company_name") as string)?.trim() ?? "";
    payload.industry = (fd.get("industry") as string)?.trim() ?? "";
    payload.business_details =
      (fd.get("business_details") as string)?.trim() ?? "";
    payload.tax_id = (fd.get("tax_id") as string)?.trim() ?? "";

    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("errorGeneric"));
      setPending(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json: { redirectTo?: string; needsConfirmation?: boolean; error?: string };
      try {
        json = await res.json();
      } catch {
        toast.error(t("errorServer"));
        setPending(false);
        return;
      }

      if (!res.ok) {
        toast.error(json.error ?? t("errorGeneric"));
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
          <input
            name="name"
            type="text"
            placeholder={t("fullNamePlaceholder")}
            required
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("email")}
          </label>
          <input
            name="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            required
            className={inputClass}
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("password")}
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              required
              minLength={12}
              autoComplete="new-password"
              className={`${inputClass} pr-10`}
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

        {/* Organization code */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
            {t("orgCode")}
          </label>
          <input
            name="org_code"
            type="text"
            placeholder={t("orgCodePlaceholder")}
            required
            value={orgCode}
            onChange={(e) => setOrgCode(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{t("orgCodeHint")}</p>
        </div>

        <div className="pt-3 border-t border-[var(--color-surface-700)] space-y-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">{t("companyHint")}</p>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                {t("companyName")} <span className="text-red-400">*</span>
              </label>
              <input
                name="company_name"
                type="text"
                placeholder={t("companyNamePlaceholder")}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                {t("industry")}
              </label>
              <select name="industry" aria-label={t("industry")} className={`${inputClass} cursor-pointer`}>
                <option value="">{t("selectIndustry")}</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {t(`industry_${ind}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                {t("businessDetails")}
              </label>
              <textarea
                name="business_details"
                placeholder={t("businessDetailsPlaceholder")}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                {t("taxId")}
              </label>
              <input
                name="tax_id"
                type="text"
                placeholder="CHE-123.456.789"
                className={inputClass}
              />
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
