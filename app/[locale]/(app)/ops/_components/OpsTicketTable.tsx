"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTicketRef } from "@/lib/utils";
import type { TicketPriority } from "@/lib/supabase/types";
import type { CanonicalTicketStatus } from "@/lib/ticket-lifecycle";
import { OPS_CANONICAL_STATUSES, OPS_PRIORITIES, canonicalOf, type OpsFilters } from "@/lib/ops/derive";
import type { OpsTicket } from "@/lib/ops/types";
import { MonoText, Tag } from "./primitives";
import { MONO, OPS, PRIORITY_COLOR, STATUS_COLOR } from "./tokens";

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: active ? OPS.gold : OPS.line,
        color: active ? OPS.gold : OPS.muted,
        background: active ? `${OPS.gold}14` : "transparent",
        outlineColor: OPS.gold,
      }}
    >
      {label}
    </button>
  );
}

export function OpsTicketTable({
  tickets,
  totalCount,
  filters,
  onFiltersChange,
  highlighted,
  localePrefix,
  authorName,
}: {
  tickets: OpsTicket[];
  totalCount: number;
  filters: OpsFilters;
  onFiltersChange: (next: OpsFilters) => void;
  highlighted: Set<string>;
  localePrefix: string;
  authorName: (id: string | null) => string;
}) {
  const t = useTranslations("ops");

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label
          className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: OPS.line, background: OPS.panel2 }}
        >
          <Search size={14} color={OPS.muted} aria-hidden />
          <span className="sr-only">{t("table.searchPlaceholder")}</span>
          <input
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            placeholder={t("table.searchPlaceholder")}
            className="w-48 bg-transparent text-[12.5px] outline-none sm:w-64"
            style={{ color: OPS.text }}
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            label={t("table.allStatuses")}
            active={filters.status === "all"}
            onClick={() => onFiltersChange({ ...filters, status: "all" })}
          />
          {OPS_CANONICAL_STATUSES.map((status: CanonicalTicketStatus) => (
            <Chip
              key={status}
              label={t(`status.${status}`)}
              active={filters.status === status}
              onClick={() => onFiltersChange({ ...filters, status })}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            label={t("table.allPriorities")}
            active={filters.priority === "all"}
            onClick={() => onFiltersChange({ ...filters, priority: "all" })}
          />
          {OPS_PRIORITIES.map((priority: TicketPriority) => (
            <Chip
              key={priority}
              label={t(`priority.${priority}`)}
              active={filters.priority === priority}
              onClick={() => onFiltersChange({ ...filters, priority })}
            />
          ))}
        </div>

        <MonoText className="ml-auto text-[11.5px]" style={{ color: OPS.faint }}>
          {tickets.length}/{totalCount}
        </MonoText>
      </div>

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: OPS.line, background: OPS.panel }}
      >
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr style={{ background: OPS.panel2, color: OPS.muted }}>
              {[
                t("table.ref"),
                t("table.title"),
                t("table.status"),
                t("table.priority"),
                t("table.assignee"),
                t("table.created"),
                t("table.sla"),
                t("table.actions"),
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="whitespace-nowrap border-b px-3 py-2 text-left font-medium"
                  style={{ borderColor: OPS.line }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const canonical = canonicalOf(ticket);
              const breached =
                ticket.sla_breached ||
                ticket.sla_response_breached ||
                ticket.sla_resolution_breached;
              const isHighlighted = highlighted.has(ticket.id);

              return (
                <tr
                  key={ticket.id}
                  className={cn("border-b transition-colors duration-700")}
                  style={{
                    borderColor: OPS.line,
                    background: isHighlighted ? `${OPS.gold}1F` : "transparent",
                  }}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`${localePrefix}/tickets/${ticket.id}`}
                      className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ ...MONO, color: OPS.muted, outlineColor: OPS.gold }}
                    >
                      {formatTicketRef(ticket.ticket_number)}
                    </Link>
                  </td>
                  <td className="max-w-[320px] px-3 py-2">
                    <span className="line-clamp-1" style={{ color: OPS.text }}>
                      {ticket.title}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Tag label={t(`status.${canonical}`)} color={STATUS_COLOR[canonical]} />
                  </td>
                  <td className="px-3 py-2">
                    <Tag
                      label={t(`priority.${ticket.priority}`)}
                      color={PRIORITY_COLOR[ticket.priority] ?? OPS.slate}
                      dot
                    />
                  </td>
                  <td className="px-3 py-2" style={{ color: OPS.muted }}>
                    {ticket.assigned_to ? authorName(ticket.assigned_to) : t("table.unassigned")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <MonoText style={{ color: OPS.muted }}>{formatDate(ticket.created_at)}</MonoText>
                  </td>
                  <td className="px-3 py-2">
                    {breached ? (
                      <span className="flex items-center gap-1.5" style={{ color: OPS.red }}>
                        <AlertTriangle size={13} aria-hidden /> {t("table.breach")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5" style={{ color: OPS.emerald }}>
                        <CheckCircle2 size={13} aria-hidden /> {t("table.ok")}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {/* Ticket management (close, assign, edit) stays in /tickets/[id],
                        with its own RLS checks and confirmations. */}
                    <Link
                      href={`${localePrefix}/tickets/${ticket.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        borderColor: OPS.line,
                        color: OPS.muted,
                        outlineColor: OPS.gold,
                      }}
                    >
                      {t("table.open")}
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center" style={{ color: OPS.faint }}>
                  {t("table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
