import { createServiceClientStatic } from "@/lib/supabase/server";
import type { OpsAuditDelivery, OpsAuditSummary } from "@/lib/ops/types";

/**
 * SLA audit deliveries for the /ops console.
 *
 * `public.audit_runs` is a security_invoker view over `helpdesk.audit_runs`,
 * granted to `service_role` only — neither `anon` nor `authenticated` can read
 * it. This module is server-only: it pulls in `@/lib/supabase/server`, which
 * imports `next/headers`, so importing it from a `"use client"` module fails
 * the build instead of shipping the key. Callers must have already verified
 * that the viewer belongs to `organizationId`.
 */

/** The daily report cron, owned by the external vidal-helpdesk-mcp pipeline. */
export const AUDIT_CRON = "0 6 * * *";

const HISTORY_DAYS = 30;

interface AuditRunRow {
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  status: string | null;
  recipient: string | null;
  provider_confirmed_at: string | null;
  provider_message_id: string | null;
  payload_snapshot: unknown;
  created_at: string | null;
}

/**
 * The compliance percentage is only carried in the delivered email subject
 * ("VIDAL Daily SLA Report: 100% compliance - 2026-08-01"), so it is parsed
 * from the payload snapshot rather than read from a column.
 */
function complianceFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const subject = (snapshot as { subject?: unknown }).subject;
  if (typeof subject !== "string") return null;
  const match = subject.match(/(\d+(?:[.,]\d+)?)\s*%\s*compliance/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function toDelivery(row: AuditRunRow): OpsAuditDelivery {
  return {
    reportingPeriodStart: row.reporting_period_start,
    reportingPeriodEnd: row.reporting_period_end,
    status: row.status,
    providerConfirmedAt: row.provider_confirmed_at,
    providerMessageId: row.provider_message_id,
    recipient: row.recipient,
    compliance: complianceFromSnapshot(row.payload_snapshot),
  };
}

export async function getAuditSummary(organizationId: string): Promise<OpsAuditSummary> {
  const empty: OpsAuditSummary = { last: null, history: [], cron: AUDIT_CRON };
  if (!organizationId) return empty;

  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createServiceClientStatic();
  const { data, error } = await supabase
    .from("audit_runs")
    .select(
      "reporting_period_start, reporting_period_end, status, recipient, provider_confirmed_at, provider_message_id, payload_snapshot, created_at"
    )
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(HISTORY_DAYS * 2);

  if (error || !data) {
    // The console must render even when the audit pipeline is unreachable.
    console.error("[ops] audit_runs read failed:", error?.message);
    return empty;
  }

  const rows = data as unknown as AuditRunRow[];
  if (rows.length === 0) return empty;

  return {
    last: toDelivery(rows[0]),
    history: rows
      .map((row) => ({
        at: row.created_at ?? row.reporting_period_start ?? "",
        compliance: complianceFromSnapshot(row.payload_snapshot),
      }))
      .filter((point) => point.at !== "")
      .reverse(),
    cron: AUDIT_CRON,
  };
}
