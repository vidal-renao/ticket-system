"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { value: "",            label: "Active",       color: "text-[var(--color-text-secondary)]" },
  { value: "new",         label: "New",          color: "text-blue-300" },
  { value: "assigned",    label: "Assigned",     color: "text-cyan-300" },
  { value: "in_progress", label: "In progress",  color: "text-indigo-300" },
  { value: "waiting",     label: "Waiting",      color: "text-amber-300" },
  { value: "ready",       label: "Ready for OK", color: "text-emerald-300" },
  { value: "processed",   label: "Processed",    color: "text-violet-300" },
  { value: "trash",       label: "Trash",        color: "text-[var(--color-text-muted)]" },
] as const;

export function AdminStatusTabs() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const current      = searchParams.get("stage") ?? "";

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("status");
    if (value) params.set("stage", value);
    else params.delete("stage");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-1">
      {TABS.map((tab) => {
        const isActive = current === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={[
              "shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
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
