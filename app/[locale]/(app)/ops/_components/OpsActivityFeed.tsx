"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";
import { formatTicketRef } from "@/lib/utils";
import type { OpsEvent, OpsEventKind } from "@/lib/ops/types";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { EmptyState, MonoText, Tag } from "./primitives";
import { EVENT_COLOR, MONO, OPS, PRIORITY_COLOR } from "./tokens";

const EVENT_ICON: Record<OpsEventKind, typeof TicketIcon> = {
  created: TicketIcon,
  first_response: Clock,
  status: ArrowLeftRight,
  resolved: CheckCircle2,
  closed: ShieldCheck,
  sla_breach: AlertTriangle,
  comment: MessageSquare,
  audit: ScrollText,
  removed: Trash2,
};

function relativeTime(iso: string, locale: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.round(seconds), "second");
}

export function OpsActivityFeed({
  events,
  locale,
  localePrefix,
  authorName,
  animate,
  now,
}: {
  events: OpsEvent[];
  locale: string;
  localePrefix: string;
  authorName: (id: string | null) => string;
  animate: boolean;
  now: number;
}) {
  const t = useTranslations("ops");

  if (events.length === 0) {
    return <EmptyState text={t("feed.empty")} />;
  }

  return (
    <ol className="relative">
      <AnimatePresence initial={false}>
        {events.map((event) => {
          const Icon = EVENT_ICON[event.kind];
          const color = EVENT_COLOR[event.kind];
          const actor = event.actorId ? authorName(event.actorId) : null;

          return (
            <motion.li
              key={event.id}
              layout={animate}
              initial={animate ? { opacity: 0, y: -10 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animate ? { opacity: 0 } : undefined}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative flex gap-3 border-b py-2.5 last:border-b-0"
              style={{ borderColor: OPS.line }}
            >
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: color, color }}
                aria-hidden
              >
                <Icon size={13} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[12.5px] font-semibold" style={{ color }}>
                    {t(`event.${event.kind}`)}
                  </span>

                  {event.ticketNumber !== null && event.ticketId && (
                    <Link
                      href={`${localePrefix}/tickets/${event.ticketId}`}
                      className="text-[12px] underline-offset-2 hover:underline"
                      style={{ ...MONO, color: OPS.muted }}
                    >
                      {formatTicketRef(event.ticketNumber)}
                    </Link>
                  )}

                  {event.ticketTitle && (
                    <span
                      className="max-w-full truncate text-[12.5px]"
                      style={{ color: OPS.text }}
                    >
                      {event.ticketTitle}
                    </span>
                  )}

                  {event.priority && (
                    <Tag
                      label={t(`priority.${event.priority}`)}
                      color={PRIORITY_COLOR[event.priority] ?? OPS.slate}
                      dot
                      small
                    />
                  )}

                  {event.isInternal && (
                    <Tag label={t("feed.internal")} color={OPS.slate} small />
                  )}
                  {event.isAiGenerated && <Tag label={t("feed.ai")} color={OPS.gold} small />}
                </div>

                {event.detail && (
                  <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: OPS.muted }}>
                    {event.detail}
                  </p>
                )}

                <MonoText className="mt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: OPS.faint }}>
                  {actor && (
                    <PresenceDot
                      userId={event.actorId}
                      label={t("presence.online", { name: actor })}
                    />
                  )}
                  {actor ? `${actor} · ` : ""}
                  {new Date(event.at).toLocaleString(locale, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {/* `now` is 0 until mount, so the first paint matches the server. */}
                  {now ? ` · ${relativeTime(event.at, locale, now)}` : ""}
                </MonoText>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
