"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Search, User } from "lucide-react";

export interface CustomerOption {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  customer_type: "individual" | "company" | null;
}

/**
 * Picking which customer a ticket belongs to.
 *
 * The whole list arrives from the server and the filtering happens here, the
 * same way the user directory works. A tenant's customer list is small enough
 * that a round trip per keystroke would buy nothing, and a list that is already
 * present can be scanned rather than only searched -- an administrator taking a
 * phone call often recognises the name faster than they can spell it.
 */
export function CustomerPicker({
  customers,
  selectedId,
  onSelect,
  disabled = false,
}: {
  customers: CustomerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.full_name, c.email, c.company_name].some((field) =>
        (field ?? "").toLowerCase().includes(q)
      )
    );
  }, [customers, query]);

  return (
    <div className="rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-4">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or company…"
          aria-label="Search customers"
          disabled={disabled}
          className="w-full rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] py-2 pl-8 pr-3 text-sm text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      </div>

      <ul
        role="listbox"
        aria-label="Customers"
        className="mt-3 max-h-64 space-y-1 overflow-y-auto"
      >
        {filtered.map((c) => {
          const selected = c.id === selectedId;
          const name = c.full_name?.trim() || c.company_name?.trim() || c.email || "Unnamed";
          return (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  selected
                    ? "bg-indigo-500/15 ring-1 ring-indigo-500/40"
                    : "hover:bg-[var(--color-surface-800)]"
                }`}
              >
                {c.customer_type === "company" ? (
                  <Building2 className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
                ) : (
                  <User className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--color-text-primary)]">{name}</span>
                  <span className="block truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                    {c.email ?? c.id.slice(0, 8)}
                    {c.company_name && c.full_name ? ` · ${c.company_name}` : ""}
                  </span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-indigo-400" aria-hidden="true" />}
              </button>
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
            {customers.length === 0
              ? "This organization has no customers yet."
              : `No customer matches “${query.trim()}”.`}
          </li>
        )}
      </ul>
    </div>
  );
}
