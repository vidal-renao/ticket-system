"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

interface TicketSearchProps {
  placeholder?: string;
  className?: string;
}

/**
 * Shared smart search box. Writes the query to the `q` URL param (debounced)
 * while preserving every other active filter, so each page's server component
 * applies its own role-scoped matching (ref, title, description, company,
 * agent, category, status, priority...).
 */
export function TicketSearch({ placeholder = "Search anything: TK-0042, company, subject, priority…", className }: TicketSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [pending, setPending] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
    setPending(false);
  }, [searchParams]);

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    params.delete("page");
    setPending(true);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  function handleChange(next: string) {
    setValue(next);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => push(next), 350);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search tickets"
        className="w-full rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] py-2.5 pl-9 pr-9 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-indigo-500 focus:outline-none"
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-text-muted)]" aria-hidden="true" />
      ) : value ? (
        <button
          type="button"
          onClick={() => handleChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
