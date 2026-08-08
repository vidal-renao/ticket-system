"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRouter as useLocaleRouter } from "@/i18n/navigation";
import { Loader2, Search, X } from "lucide-react";
import { formatTicketRef } from "@/lib/utils";

interface TicketSearchProps {
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
}

const SUGGEST_DEBOUNCE_MS = 250;
const FILTER_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

/**
 * Shared smart search box. Writes the query to the `q` URL param (debounced)
 * while preserving every other active filter, so each page's server component
 * applies its own role-scoped matching (ref, title, description, company,
 * agent, category, status, priority...).
 *
 * On top of that it offers autocomplete: matching tickets are fetched from
 * /api/tickets/suggest as you type and picking one jumps straight to the
 * ticket, skipping the filtered list. The list keeps working untouched for
 * anyone who ignores the dropdown or has JavaScript disabled mid-flight.
 */
export function TicketSearch({ placeholder = "Search anything: TK-0042, company, subject, priority…", className }: TicketSearchProps) {
  const router = useRouter();
  const localeRouter = useLocaleRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [pending, setPending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounce = useRef<number | null>(null);
  const suggestDebounce = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
    setPending(false);
  }, [searchParams]);

  // A click anywhere else dismisses the dropdown.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
      if (suggestDebounce.current) window.clearTimeout(suggestDebounce.current);
    };
  }, []);

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    params.delete("page");
    setPending(true);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  // Kept in a ref so the fetch callback can compare against the latest value
  // without re-creating the handler on every keystroke.
  const inputValueRef = useRef(value);
  inputValueRef.current = value;

  function fetchSuggestions(next: string) {
    const query = next.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    void fetch(`/api/tickets/suggest?q=${encodeURIComponent(query)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { results: [] }))
      .then((data: { results?: Suggestion[] }) => {
        // Ignore a response that lost the race with newer typing.
        if (query !== inputValueRef.current.trim()) return;
        setSuggestions(data.results ?? []);
        setActiveIndex(-1);
        setOpen((data.results ?? []).length > 0);
      })
      .catch(() => {
        // Autocomplete is an accelerator; the filtered list still works.
        setSuggestions([]);
        setOpen(false);
      });
  }

  function handleChange(next: string) {
    setValue(next);

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => push(next), FILTER_DEBOUNCE_MS);

    if (suggestDebounce.current) window.clearTimeout(suggestDebounce.current);
    suggestDebounce.current = window.setTimeout(() => fetchSuggestions(next), SUGGEST_DEBOUNCE_MS);
  }

  function goTo(suggestion: Suggestion) {
    setOpen(false);
    setActiveIndex(-1);
    localeRouter.push(`/tickets/${suggestion.id}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // Enter without a highlighted row keeps the default behaviour: filter
      // the list, do not navigate.
      event.preventDefault();
      goTo(suggestions[activeIndex]);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(suggestions.length > 0)}
        placeholder={placeholder}
        aria-label="Search tickets"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
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

      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] py-1 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                // Fires before the input's blur, so the click is not lost.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goTo(suggestion)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  index === activeIndex
                    ? "bg-[var(--color-surface-700)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-800)]"
                }`}
              >
                <span className="shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
                  {formatTicketRef(suggestion.ticket_number)}
                </span>
                <span className="truncate">{suggestion.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
