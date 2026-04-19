"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

interface AdminFiltersProps {
  companies: string[];
  agents: Array<{ id: string; name: string }>;
  categories: string[];
}

const selectClass = [
  "px-3 py-2 rounded-lg text-sm cursor-pointer",
  "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
  "text-[var(--color-text-primary)]",
  "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
  "transition-colors",
].join(" ");

const STATUS_OPTIONS = [
  { value: "open",              label: "Open" },
  { value: "in_progress",       label: "In Progress" },
  { value: "pending_customer",  label: "Pending Customer" },
  { value: "resolved",          label: "Resolved" },
  { value: "closed",            label: "Closed" },
];

export function AdminFilters({ companies, agents, categories }: AdminFiltersProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const current = {
    company:  searchParams.get("company")  ?? "",
    priority: searchParams.get("priority") ?? "",
    status:   searchParams.get("status")   ?? "",
    category: searchParams.get("category") ?? "",
    agent:    searchParams.get("agent")    ?? "",
  };

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
      params.delete("page"); // reset to page 1 on filter change
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  const hasFilters =
    current.company || current.priority || current.status || current.category || current.agent;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Company */}
      <select
        value={current.company}
        onChange={(e) => update("company", e.target.value)}
        aria-label="Filter by company"
        className={selectClass}
      >
        <option value="">All Companies</option>
        {companies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Status */}
      <select
        value={current.status}
        onChange={(e) => update("status", e.target.value)}
        aria-label="Filter by status"
        className={selectClass}
      >
        <option value="">All Status</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={current.priority}
        onChange={(e) => update("priority", e.target.value)}
        aria-label="Filter by priority"
        className={selectClass}
      >
        <option value="">All Priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Category */}
      {categories.length > 0 && (
        <select
          value={current.category}
          onChange={(e) => update("category", e.target.value)}
          aria-label="Filter by category"
          className={selectClass}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {/* Agent */}
      <select
        value={current.agent}
        onChange={(e) => update("agent", e.target.value)}
        aria-label="Filter by agent"
        className={selectClass}
      >
        <option value="">All Agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {/* Clear */}
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)] transition-colors"
        >
          <X className="w-3 h-3" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}
