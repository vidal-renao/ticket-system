"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

interface AdminFiltersProps {
  companies: string[];
  agents: Array<{ id: string; name: string }>;
}

const inputClass = [
  "px-3 py-2 rounded-lg text-sm cursor-pointer",
  "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
  "text-[var(--color-text-primary)]",
  "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
  "transition-colors",
].join(" ");

export function AdminFilters({ companies, agents }: AdminFiltersProps) {
  const t  = useTranslations("admin");
  const tp = useTranslations("priority");
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();

  const current = {
    company:  searchParams.get("company")  ?? "",
    priority: searchParams.get("priority") ?? "",
    agent:    searchParams.get("agent")    ?? "",
  };

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  const hasFilters = current.company || current.priority || current.agent;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Company filter */}
      <select
        value={current.company}
        onChange={(e) => update("company", e.target.value)}
        aria-label={t("company")}
        className={inputClass}
      >
        <option value="">{t("allCompanies")}</option>
        {companies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Priority filter */}
      <select
        value={current.priority}
        onChange={(e) => update("priority", e.target.value)}
        aria-label={t("allPriorities")}
        className={inputClass}
      >
        <option value="">{t("allPriorities")}</option>
        <option value="critical">{tp("critical")}</option>
        <option value="high">{tp("high")}</option>
        <option value="medium">{tp("medium")}</option>
        <option value="low">{tp("low")}</option>
      </select>

      {/* Agent filter */}
      <select
        value={current.agent}
        onChange={(e) => update("agent", e.target.value)}
        aria-label={t("allAgents")}
        className={inputClass}
      >
        <option value="">{t("allAgents")}</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] transition-colors"
        >
          <X className="w-3 h-3" aria-hidden="true" />
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}
