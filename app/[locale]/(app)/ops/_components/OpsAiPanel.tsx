"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatTicketRef } from "@/lib/utils";
import type { OpsAiAnalysis, OpsTicket } from "@/lib/ops/types";
import { EmptyState, MonoText, Panel, Tag } from "./primitives";
import { OPS } from "./tokens";

const SENTIMENT_COLOR: Record<string, string> = {
  positive: OPS.emerald,
  neutral: OPS.slate,
  negative: OPS.amber,
  frustrated: OPS.red,
  angry: OPS.red,
  urgent: OPS.red,
};

/**
 * Secondary panel: AI triage signal. `confidence_score` is stored as an integer
 * percentage (0-100) in this database, so it is rendered as-is.
 */
export function OpsAiPanel({
  analyses,
  tickets,
  localePrefix,
}: {
  analyses: OpsAiAnalysis[];
  tickets: OpsTicket[];
  localePrefix: string;
}) {
  const t = useTranslations("ops");

  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const visible = analyses.filter((analysis) => analysis.ticket_id && ticketById.has(analysis.ticket_id));

  const scores = visible
    .map((analysis) => analysis.confidence_score)
    .filter((score): score is number => typeof score === "number");
  const averageConfidence =
    scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

  return (
    <Panel title={t("ai.title")}>
      {visible.length === 0 ? (
        <EmptyState text={t("ai.empty")} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
            <span style={{ color: OPS.muted }}>
              {t("ai.analyzed")}{" "}
              <MonoText style={{ color: OPS.text }}>{visible.length}</MonoText>
            </span>
            {averageConfidence !== null && (
              <span style={{ color: OPS.muted }}>
                {t("ai.avgConfidence")}{" "}
                <MonoText style={{ color: OPS.gold }}>{averageConfidence}%</MonoText>
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {visible.slice(0, 6).map((analysis) => {
              const ticket = ticketById.get(analysis.ticket_id as string);
              const sentiment = analysis.sentiment?.toLowerCase() ?? null;

              return (
                <li
                  key={analysis.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-2 text-[12.5px] last:border-b-0 last:pb-0"
                  style={{ borderColor: OPS.line }}
                >
                  {ticket && (
                    <Link
                      href={`${localePrefix}/tickets/${ticket.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      <MonoText style={{ color: OPS.muted }}>
                        {formatTicketRef(ticket.ticket_number)}
                      </MonoText>
                    </Link>
                  )}
                  <span className="min-w-0 flex-1 truncate" style={{ color: OPS.text }}>
                    {analysis.summary ?? ticket?.title ?? "—"}
                  </span>
                  {sentiment && (
                    <Tag
                      label={sentiment}
                      color={SENTIMENT_COLOR[sentiment] ?? OPS.slate}
                      small
                      dot
                    />
                  )}
                  {typeof analysis.confidence_score === "number" && (
                    <MonoText className="text-[11.5px]" style={{ color: OPS.faint }}>
                      {analysis.confidence_score}%
                    </MonoText>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
