"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import { Activity, ShieldCheck, Ticket as TicketIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { effectivePresence, type EffectivePresence } from "@/lib/presence";
import {
  OPS_TICKET_COLUMNS,
  type OpsAuditLog,
  type OpsAuditSummary,
  type OpsAuthor,
  type OpsComment,
  type OpsEvent,
  type OpsInitialData,
  type OpsTicket,
} from "@/lib/ops/types";
import {
  auditEvent,
  commentEvent,
  computeMonthlyFlow,
  computeOpsKpis,
  filterOpsTickets,
  mergeEvents,
  ticketUpdateEvents,
  type OpsFilters,
} from "@/lib/ops/derive";
import { useOpsRealtime, type OpsRealtimeStatus } from "./useOpsRealtime";
import { Metric, MonoText, Panel } from "./_components/primitives";
import { OpsCharts } from "./_components/OpsCharts";
import { OpsTicketTable } from "./_components/OpsTicketTable";
import { OpsActivityFeed } from "./_components/OpsActivityFeed";
import { OpsAuditPanel } from "./_components/OpsAuditPanel";
import { OpsAiPanel } from "./_components/OpsAiPanel";
import { OPS } from "./_components/tokens";

const HIGHLIGHT_MS = 1_600;
const KPI_DEBOUNCE_MS = 180;
const AUDIT_REFRESH_MIN_MS = 60_000;
const TICKET_LIMIT = 500;

type OpsTab = "overview" | "tickets" | "activity";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const STATUS_DOT: Record<OpsRealtimeStatus, string> = {
  connecting: OPS.amber,
  live: OPS.emerald,
  reconnecting: OPS.amber,
  offline: OPS.red,
};

export function OpsConsole({
  initialData,
  initialAudit,
  locale,
}: {
  initialData: OpsInitialData;
  initialAudit: OpsAuditSummary;
  locale: string;
}) {
  const t = useTranslations("ops");
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;
  const localePrefix = locale === "de" ? "" : `/${locale}`;

  const supabase = useMemo(() => createClient(), []);

  const [tickets, setTickets] = useState<OpsTicket[]>(initialData.tickets);
  const [events, setEvents] = useState<OpsEvent[]>(initialData.events);
  const [authors, setAuthors] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialData.authors.map((author: OpsAuthor) => [author.id, author.full_name ?? "—"])
    )
  );
  const [presenceById, setPresenceById] = useState<
    Record<string, { status: string | null; lastSeen: string | null }>
  >(() =>
    Object.fromEntries(
      initialData.authors.map((author: OpsAuthor) => [
        author.id,
        { status: author.availability_status ?? null, lastSeen: author.last_seen_at ?? null },
      ])
    )
  );
  const [audit, setAudit] = useState<OpsAuditSummary>(initialAudit);
  const [refreshingAudit, setRefreshingAudit] = useState(false);
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<OpsTab>("overview");
  const [filters, setFilters] = useState<OpsFilters>({
    status: "all",
    priority: "all",
    query: "",
  });
  // Stays 0 until mounted so server and client render the same first paint.
  const [now, setNow] = useState(0);

  // Mirrors of the state used inside realtime callbacks, so the handlers never
  // depend on a render cycle and never re-subscribe.
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const pendingAuthorsRef = useRef<Set<string>>(new Set());
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastAuditFetchRef = useRef(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const highlight = useCallback(
    (ticketId: string) => {
      if (prefersReducedMotion) return;
      setHighlighted((previous) => new Set(previous).add(ticketId));
      const timers = highlightTimersRef.current;
      const existing = timers.get(ticketId);
      if (existing) clearTimeout(existing);
      timers.set(
        ticketId,
        setTimeout(() => {
          timers.delete(ticketId);
          setHighlighted((previous) => {
            const next = new Set(previous);
            next.delete(ticketId);
            return next;
          });
        }, HIGHLIGHT_MS)
      );
    },
    [prefersReducedMotion]
  );

  /** Realtime payloads carry ids only, so unknown people are resolved lazily. */
  const ensureAuthors = useCallback(
    (ids: (string | null | undefined)[]) => {
      const missing = ids.filter(
        (id): id is string =>
          Boolean(id) && !authorsRef.current[id as string] && !pendingAuthorsRef.current.has(id as string)
      );
      if (missing.length === 0) return;
      missing.forEach((id) => pendingAuthorsRef.current.add(id));

      void supabase
        .from("profiles")
        .select("id, full_name, role, availability_status, last_seen_at")
        .in("id", missing)
        .then(({ data }) => {
          missing.forEach((id) => pendingAuthorsRef.current.delete(id));
          if (!data || data.length === 0) return;
          const rows = data as unknown as OpsAuthor[];
          setAuthors((previous) => {
            const next = { ...previous };
            for (const row of rows) next[row.id] = row.full_name ?? "—";
            return next;
          });
          setPresenceById((previous) => {
            const next = { ...previous };
            for (const row of rows) {
              // Same rule as the server pass: only staff carry presence, so a
              // customer never renders as "offline".
              const isStaff = row.role === "agent" || row.role === "manager" || row.role === "admin";
              next[row.id] = {
                status: isStaff ? (row.availability_status ?? null) : null,
                lastSeen: isStaff ? (row.last_seen_at ?? null) : null,
              };
            }
            return next;
          });
        });
    },
    [supabase]
  );

  const applyTicket = useCallback(
    (row: OpsTicket) => {
      const previous = ticketsRef.current.find((ticket) => ticket.id === row.id);
      const newEvents = ticketUpdateEvents(previous, row);

      let next: OpsTicket[];
      if (row.deleted_at) {
        // Soft delete: the row leaves every view.
        next = ticketsRef.current.filter((ticket) => ticket.id !== row.id);
      } else if (!previous) {
        next = [row, ...ticketsRef.current];
      } else {
        next = ticketsRef.current.map((ticket) => (ticket.id === row.id ? row : ticket));
      }

      ticketsRef.current = next;
      setTickets(next);
      if (newEvents.length > 0) setEvents((current) => mergeEvents(current, newEvents));
      if (!row.deleted_at) highlight(row.id);
      ensureAuthors([row.created_by, row.assigned_to]);
    },
    [ensureAuthors, highlight]
  );

  const applyComment = useCallback(
    (row: OpsComment) => {
      const ticket = ticketsRef.current.find((candidate) => candidate.id === row.ticket_id);
      setEvents((current) => mergeEvents(current, [commentEvent(row, ticket)]));
      if (ticket) highlight(ticket.id);
      ensureAuthors([row.author_id]);
    },
    [ensureAuthors, highlight]
  );

  const applyAuditLog = useCallback(
    (row: OpsAuditLog) => {
      const ticket = row.resource_id
        ? ticketsRef.current.find((candidate) => candidate.id === row.resource_id)
        : undefined;
      setEvents((current) => mergeEvents(current, [auditEvent(row, ticket)]));
      ensureAuthors([row.actor_id]);
    },
    [ensureAuthors]
  );

  /** After a dropped socket, re-read the snapshot to close the event gap. */
  const resync = useCallback(() => {
    void supabase
      .from("tickets")
      .select(OPS_TICKET_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(TICKET_LIMIT)
      .then(({ data }) => {
        if (!data) return;
        const rows = data as unknown as OpsTicket[];
        ticketsRef.current = rows;
        setTickets(rows);
      });
  }, [supabase]);

  const { status: realtimeStatus, lastEventAt } = useOpsRealtime(
    supabase,
    initialData.organizationId,
    {
      onTicket: applyTicket,
      onComment: applyComment,
      onAuditLog: applyAuditLog,
      onResync: resync,
    }
  );

  const refreshAudit = useCallback(async () => {
    setRefreshingAudit(true);
    lastAuditFetchRef.current = Date.now();
    try {
      const response = await fetch("/api/audit", { cache: "no-store" });
      if (response.ok) setAudit((await response.json()) as OpsAuditSummary);
    } catch {
      // Audit is a secondary panel: a failed refresh keeps the last snapshot.
    } finally {
      setRefreshingAudit(false);
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAuditFetchRef.current < AUDIT_REFRESH_MIN_MS) return;
      void refreshAudit();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAudit]);

  // KPIs are debounced so a burst of realtime events recalculates once.
  const debouncedTickets = useDebouncedValue(tickets, KPI_DEBOUNCE_MS);
  const kpis = useMemo(() => computeOpsKpis(debouncedTickets), [debouncedTickets]);
  const flow = useMemo(() => computeMonthlyFlow(debouncedTickets), [debouncedTickets]);
  const filteredTickets = useMemo(() => filterOpsTickets(tickets, filters), [tickets, filters]);

  const authorName = useCallback(
    (id: string | null) => (id ? (authors[id] ?? t("table.unknownActor")) : t("table.unassigned")),
    [authors, t]
  );

  /**
   * Presence is re-derived on every clock tick rather than frozen at render
   * time. A console left open on a wall would otherwise keep showing an agent
   * as available long after they closed their laptop — the exact staleness
   * this signal exists to prevent. Someone going *offline* decays here within
   * the heartbeat window; someone coming back online appears on the next load,
   * since `profiles` is not part of the realtime publication.
   *
   * Before mount `now` is 0, so the server's clock is used and the first paint
   * matches what the server rendered.
   */
  const authorPresence = useCallback(
    (id: string | null): EffectivePresence | null => {
      if (!id) return null;
      const source = presenceById[id];
      if (!source?.status) return null;
      const at = now === 0 ? Date.parse(initialData.renderedAt) : now;
      return effectivePresence(source.status, source.lastSeen, at);
    },
    [presenceById, now, initialData.renderedAt]
  );

  const tabs: [OpsTab, string, typeof ShieldCheck][] = [
    ["overview", t("tabs.overview"), ShieldCheck],
    ["tickets", t("tabs.tickets"), TicketIcon],
    ["activity", t("tabs.activity"), Activity],
  ];

  return (
    <div
      className="-m-4 min-h-screen p-4 sm:-m-6 sm:p-6"
      style={{ background: OPS.bg, color: OPS.text }}
    >
      {/* Top bar */}
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: OPS.line }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-bold tracking-[0.12em]">
            VIDAL<span style={{ color: OPS.gold }}> ECOSYSTEM</span>
          </span>
          <MonoText className="text-[13px]" style={{ color: OPS.muted }}>
            {t("title")}
          </MonoText>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[13px]" style={{ color: OPS.muted }}>
            {t("org")} <b style={{ color: OPS.text }}>{initialData.organizationName}</b>
          </span>
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px]"
            style={{ borderColor: OPS.emerald, color: OPS.emerald }}
          >
            <ShieldCheck size={12} aria-hidden /> {t("swissDsg")}
          </span>
          <span
            className="inline-flex items-center gap-2 text-[12px]"
            style={{ color: OPS.muted }}
            role="status"
            aria-live="polite"
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                animate && realtimeStatus === "live" && "animate-pulse"
              )}
              style={{ background: STATUS_DOT[realtimeStatus] }}
              aria-hidden
            />
            <MonoText>
              {t(`realtime.${realtimeStatus}`)}
              {lastEventAt && now
                ? ` · ${t("realtime.lastEvent")} ${new Date(lastEventAt).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : ""}
            </MonoText>
          </span>
        </div>
      </header>

      {/* KPI ribbon */}
      <div
        className="my-4 flex flex-wrap rounded-xl border"
        style={{ borderColor: OPS.line, background: OPS.panel }}
      >
        <Metric
          label={t("kpi.compliance")}
          value={audit.last?.compliance != null ? `${audit.last.compliance}%` : "—"}
          color={OPS.gold}
          emphasis
        />
        <Metric label={t("kpi.active")} value={kpis.active} />
        <Metric label={t("kpi.unassigned")} value={kpis.unassigned} color={OPS.amber} />
        <Metric label={t("kpi.inProgress")} value={kpis.inProgress} color={OPS.blue} />
        <Metric label={t("kpi.waiting")} value={kpis.waiting} color={OPS.slate} />
        <Metric label={t("kpi.resolved")} value={kpis.resolved} color={OPS.emerald} />
        <Metric label={t("kpi.closed")} value={kpis.closed} color={OPS.faint} />
        <Metric
          label={t("kpi.slaBreached")}
          value={kpis.slaBreached}
          color={kpis.slaBreached > 0 ? OPS.red : OPS.emerald}
        />
        <Metric
          label={t("kpi.critical")}
          value={kpis.critical}
          color={kpis.critical > 0 ? OPS.red : OPS.emerald}
        />
        <Metric label={t("kpi.awaitingReview")} value={kpis.awaitingReview} color={OPS.gold} />
        <Metric label={t("kpi.total")} value={kpis.total} />
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b" style={{ borderColor: OPS.line }} aria-label={t("title")}>
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className="flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: tab === id ? OPS.text : OPS.muted,
              borderColor: tab === id ? OPS.gold : "transparent",
              outlineColor: OPS.gold,
            }}
          >
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </nav>

      <main className="flex flex-col gap-4 pt-4">
        {tab === "overview" && (
          <>
            {/* The feed is the only part that moves on its own, so it leads:
                first in the DOM (so it stacks on top on narrow screens) and
                pinned to the right column on desktop, where it stays in view
                while the rest of the page scrolls. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
              <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
                <Panel title={t("feed.recent")}>
                  <div className="max-h-[22rem] overflow-y-auto lg:max-h-[calc(100dvh-13rem)]">
                    <OpsActivityFeed
                      events={events.slice(0, 14)}
                      locale={locale}
                      localePrefix={localePrefix}
                      authorName={authorName}
                      authorPresence={authorPresence}
                      animate={animate}
                      now={now}
                    />
                  </div>
                </Panel>
              </aside>

              <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
                <OpsCharts kpis={kpis} flow={flow} animate={animate} />
                <OpsAuditPanel
                  audit={audit}
                  locale={locale}
                  refreshing={refreshingAudit}
                  onRefresh={() => void refreshAudit()}
                />
                <OpsAiPanel
                  analyses={initialData.aiAnalysis}
                  tickets={tickets}
                  localePrefix={localePrefix}
                />
              </div>
            </div>
          </>
        )}

        {tab === "tickets" && (
          <OpsTicketTable
            tickets={filteredTickets}
            totalCount={tickets.length}
            filters={filters}
            onFiltersChange={setFilters}
            highlighted={highlighted}
            localePrefix={localePrefix}
            authorName={authorName}
            authorPresence={authorPresence}
          />
        )}

        {tab === "activity" && (
          <Panel title={t("feed.title")}>
            <OpsActivityFeed
              events={events}
              locale={locale}
              localePrefix={localePrefix}
              authorName={authorName}
              authorPresence={authorPresence}
              animate={animate}
              now={now}
            />
          </Panel>
        )}

        <footer
          className="flex flex-wrap justify-between gap-2 border-t pt-3 text-[11.5px]"
          style={{ borderColor: OPS.line, color: OPS.faint }}
        >
          <MonoText>{t("footer.source")}</MonoText>
          <MonoText>{t("footer.compliance")}</MonoText>
        </footer>
      </main>
    </div>
  );
}
