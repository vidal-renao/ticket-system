"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpsAuditLog, OpsComment, OpsTicket } from "@/lib/ops/types";

export type OpsRealtimeStatus = "connecting" | "live" | "reconnecting" | "offline";

interface OpsRealtimeHandlers {
  onTicket: (row: OpsTicket) => void;
  onComment: (row: OpsComment) => void;
  onAuditLog: (row: OpsAuditLog) => void;
  /** Called after a dropped connection is restored, to close the event gap. */
  onResync: () => void;
}

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

/**
 * Subscribes the console to the three published tables.
 *
 * Realtime enforces RLS per subscriber, so the socket must carry the user's
 * JWT — `setAuth` is called with the live session token before subscribing,
 * otherwise the server evaluates the policies as `anon` and silently sends
 * nothing. Only INSERT and UPDATE are consumed: removals are soft deletes,
 * which arrive as an UPDATE setting `deleted_at`.
 */
export function useOpsRealtime(
  supabase: SupabaseClient,
  organizationId: string,
  handlers: OpsRealtimeHandlers
): { status: OpsRealtimeStatus; lastEventAt: number | null } {
  const [status, setStatus] = useState<OpsRealtimeStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  // Keep handlers in a ref so re-renders never tear down the subscription.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let hadFailure = false;

    const markEvent = () => setLastEventAt(Date.now());

    const scheduleRetry = () => {
      if (disposed) return;
      hadFailure = true;
      setStatus("reconnecting");
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
      attempt += 1;
      retryTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed) return;

      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;
      if (!session) {
        // No session means the middleware will bounce the next navigation;
        // stop retrying instead of hammering an unauthenticated socket.
        setStatus("offline");
        return;
      }
      supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`ops-console-${organizationId}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "hd_tickets",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            markEvent();
            handlersRef.current.onTicket(payload.new as unknown as OpsTicket);
          }
        )
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "UPDATE",
            schema: "public",
            table: "hd_tickets",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            markEvent();
            handlersRef.current.onTicket(payload.new as unknown as OpsTicket);
          }
        )
        .on(
          // ticket_comments has no organization column; RLS scopes the stream.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "hd_ticket_comments" },
          (payload: { new: Record<string, unknown> }) => {
            markEvent();
            handlersRef.current.onComment(payload.new as unknown as OpsComment);
          }
        )
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "hd_ticket_audit_logs",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            markEvent();
            handlersRef.current.onAuditLog(payload.new as unknown as OpsAuditLog);
          }
        )
        .subscribe((channelStatus: string) => {
          if (disposed) return;
          if (channelStatus === "SUBSCRIBED") {
            attempt = 0;
            setStatus("live");
            if (hadFailure) {
              hadFailure = false;
              handlersRef.current.onResync();
            }
            return;
          }
          if (
            channelStatus === "CHANNEL_ERROR" ||
            channelStatus === "TIMED_OUT" ||
            channelStatus === "CLOSED"
          ) {
            scheduleRetry();
          }
        });
    };

    void connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, organizationId]);

  return { status, lastEventAt };
}
