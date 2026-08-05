"use client";

import { useTranslations } from "next-intl";
import { CalendarClock, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { OpsAuditSummary } from "@/lib/ops/types";
import { EmptyState, MonoText, Panel } from "./primitives";
import { MONO, OPS } from "./tokens";

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const width = 180;
  const height = 34;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 100);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const path = points
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden
      className="max-w-full"
    >
      <path d={path} fill="none" stroke={OPS.gold} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function Item({
  icon,
  label,
  value,
  color,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5" style={{ color: color ?? OPS.muted }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: OPS.faint }}>
          {label}
        </div>
        <div
          className="truncate text-[12.5px]"
          style={{ color: OPS.text, ...(mono ? MONO : {}) }}
          title={value}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function OpsAuditPanel({
  audit,
  locale,
  refreshing,
  onRefresh,
}: {
  audit: OpsAuditSummary;
  locale: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("ops");

  const compliancePoints = audit.history
    .map((point) => point.compliance)
    .filter((value): value is number => value !== null);

  const formatDateTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <Panel
      title={t("audit.title")}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] disabled:opacity-50"
          style={{ borderColor: OPS.line, color: OPS.muted }}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : undefined} aria-hidden />
          {t("audit.refresh")}
        </button>
      }
    >
      {!audit.last ? (
        <EmptyState text={t("audit.never")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Item
            icon={<MailCheck size={14} />}
            color={OPS.emerald}
            label={t("audit.lastDelivery")}
            value={formatDateTime(audit.last.providerConfirmedAt ?? audit.last.reportingPeriodEnd)}
          />
          <Item
            icon={<ShieldCheck size={14} />}
            color={audit.last.providerConfirmedAt ? OPS.emerald : OPS.amber}
            label={t("audit.status")}
            value={
              audit.last.providerConfirmedAt
                ? `${audit.last.status ?? "—"} · ${t("audit.providerConfirmed")}`
                : (audit.last.status ?? "—")
            }
            mono
          />
          <Item
            icon={<CalendarClock size={14} />}
            color={OPS.gold}
            label={t("audit.schedule")}
            value={`${audit.cron} · ${t("audit.daily")}`}
            mono
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: OPS.faint }}>
              {t("audit.compliance30d")}
            </div>
            <div className="flex items-end gap-3">
              <MonoText className="text-2xl font-bold" style={{ color: OPS.gold }}>
                {audit.last.compliance !== null ? `${audit.last.compliance}%` : "—"}
              </MonoText>
              <Sparkline points={compliancePoints} />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
