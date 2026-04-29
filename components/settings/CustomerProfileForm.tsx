"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { saveCustomerProfile } from "@/app/actions/customer-actions";
import { toast } from "sonner";
import { customerProfileSchema } from "@/lib/validation/security";

interface CustomerProfileFormProps {
  initial: {
    company_name: string;
    industry: string;
    business_details: string;
    tax_id: string;
  } | null;
}

const INDUSTRIES = [
  "real_estate", "healthcare", "finance", "manufacturing",
  "retail", "hospitality", "technology", "construction", "education", "other",
] as const;

export function CustomerProfileForm({ initial }: CustomerProfileFormProps) {
  const t = useTranslations("settings");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    company_name:     initial?.company_name     ?? "",
    industry:         initial?.industry         ?? "",
    business_details: initial?.business_details ?? "",
    tax_id:           initial?.tax_id           ?? "",
  });

  const inputClass = [
    "w-full px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
    "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
    "transition-colors",
  ].join(" ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = customerProfileSchema.safeParse(form);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? t("saveError"));
      return;
    }
    setPending(true);
    const result = await saveCustomerProfile(form);
    setPending(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(t("saved"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          {t("companyName")} <span className="text-red-400" aria-label="required">*</span>
        </label>
        <input
          type="text"
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          placeholder={t("companyNamePlaceholder")}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          {t("industry")}
        </label>
        <select
          value={form.industry}
          onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
          aria-label={t("industry")}
          className={`${inputClass} cursor-pointer`}
        >
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
          value={form.business_details}
          onChange={(e) => setForm((f) => ({ ...f, business_details: e.target.value }))}
          placeholder={t("businessDetailsPlaceholder")}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          {t("taxId")}
        </label>
        <input
          type="text"
          value={form.tax_id}
          onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
          placeholder="CHE-123.456.789"
          className={inputClass}
        />
      </div>

      <Button type="submit" loading={pending} size="sm">
        {t("saveProfile")}
      </Button>
    </form>
  );
}
