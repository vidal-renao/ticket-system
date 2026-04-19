"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { value: "",            label: "All Open",    color: "text-[var(--color-text-secondary)]" },
  { value: "open",        label: "Open",         color: "text-blue-400" },
  { value: "in_progress", label: "In Progress",  color: "text-indigo-400" },
  { value: "resolved",    label: "Resolved",     color: "text-green-400" },
  { value: "closed",      label: "Closed",       color: "text-[var(--color-text-muted)]" },
] as const;

export function AdminStatusTabs() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const current      = searchParams.get("status") ?? "";

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] w-fit mb-4">
      {TABS.map((tab) => {
        const isActive = current === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={[
              "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
              isActive
                ? `bg-[var(--color-surface-700)] ${tab.color} shadow-sm border border-[var(--color-surface-500)]`
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-700)]/50",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
