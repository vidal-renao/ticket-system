"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SlaCountdown } from "@/components/tickets/SlaCountdown";
import type { SlaDisplay, SlaOverallState, SlaTargetDisplay } from "@/lib/sla-display";

const BADGE: Record<SlaOverallState, { key: "onTime" | "atRisk" | "breached" | "met"; className: string; Icon: typeof Clock }> = {
  on_time: { key: "onTime", className: "text-green-400 bg-green-400/10 border-green-400/20", Icon: Clock },
  at_risk: { key: "atRisk", className: "text-amber-400 bg-amber-400/10 border-amber-400/20", Icon: AlertTriangle },
  breached: { key: "breached", className: "text-red-400 bg-red-400/10 border-red-400/20", Icon: AlertTriangle },
  met: { key: "met", className: "text-green-400 bg-green-400/10 border-green-400/20", Icon: CheckCircle2 },
};

function formatTimestamp(value: string, locale: string): string {
  return new Date(value).toLocaleString(`${locale}-CH`, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The ticket's SLA targets. The state of each row comes from
 * `deriveSlaDisplay` (lib/sla-display.ts), computed by the page; this only
 * renders it. Finished targets show their outcome and time, so nothing keeps
 * counting once the response or resolution has happened.
 */
export function SlaDeadlineCard({ display, locale }: { display: SlaDisplay; locale: string }) {
  const t = useTranslations("ticket");
  if (!display.response && !display.resolution) return null;

  const badge = display.overall ? BADGE[display.overall] : null;

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{t("slaDeadline")}</p>
          {badge && (
            <Badge className={badge.className}>
              <badge.Icon className="w-3 h-3" aria-hidden="true" />
              {t(`sla.badge.${badge.key}`)}
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          {display.response && (
            <SlaRow
              target={display.response}
              label={t("sla.response")}
              metLabel={t("sla.responded")}
              missedLabel={t("sla.respondedLate")}
              overdueLabel={t("sla.overdue")}
              locale={locale}
            />
          )}
          {display.resolution && (
            <SlaRow
              target={display.resolution}
              label={t("sla.resolution")}
              metLabel={t("sla.resolvedOnTime")}
              missedLabel={t("sla.resolvedLate")}
              overdueLabel={t("sla.overdue")}
              locale={locale}
            />
          )}
        </div>
        {display.overall === "breached" && (
          <p className="text-xs text-red-400 mt-1">{t("slaBreached")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SlaRow({
  target,
  label,
  metLabel,
  missedLabel,
  overdueLabel,
  locale,
}: {
  target: SlaTargetDisplay;
  label: string;
  metLabel: string;
  missedLabel: string;
  overdueLabel: string;
  locale: string;
}) {
  if (target.state === "running" || target.state === "at_risk") {
    // Keyed on the due date: a reopened ticket gets a new deadline and the
    // countdown must start from it, not from its previous state.
    return <SlaCountdown key={target.dueAt} dueAt={target.dueAt} label={label} overdueLabel={overdueLabel} />;
  }

  if (target.state === "overdue") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="text-[var(--color-text-muted)]">{label}:</span>
        <span className="font-semibold">{overdueLabel}</span>
      </div>
    );
  }

  const met = target.state === "met";
  const Icon = met ? CheckCircle2 : XCircle;
  return (
    <div className={`flex items-center gap-1.5 text-xs ${met ? "text-green-400" : "text-red-400"}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="text-[var(--color-text-muted)]">{label}:</span>
      <span className="font-semibold">{met ? metLabel : missedLabel}</span>
      {target.completedAt && (
        // Formatted in the viewer's time zone; the server renders UTC.
        <span className="text-[var(--color-text-muted)]" suppressHydrationWarning>
          · {formatTimestamp(target.completedAt, locale)}
        </span>
      )}
    </div>
  );
}
