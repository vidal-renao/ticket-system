import { createServiceClientStatic } from "@/lib/supabase/server";
import { linkIssuanceLogEntry, logLinkIssuance } from "@/lib/link-handoff";

/**
 * Persistent audit trail of administrative actions (REQ-F1-06, ADR-019).
 *
 * Rows go to public.hd_admin_audit_logs, which is append-only for every role
 * and readable only by administrators of the same organization
 * (202611170004). The table is written exclusively with service_role, here
 * and by the MCP server (actor_type 'mcp').
 */
export type AdminAuditAction =
  | "user.created"
  | "user.role_changed"
  | "user.frozen"
  | "user.unfrozen"
  | "user.deleted"
  | "user.restored"
  | "customer.created"
  | "access_link.issued"
  | "org.pii_scrubbing_changed";

export interface AdminAuditEvent {
  /** Always the organization derived on the server, never one sent by a client. */
  organizationId: string | null | undefined;
  actorId: string | null;
  actorType?: "user" | "system";
  action: AdminAuditAction;
  targetType?: "user" | "organization" | null;
  targetId?: string | null;
  outcome?: "success" | "failure";
  details?: Record<string, unknown>;
}

const SECRET_KEY = /(^|_)(password|passwd|token|secret|cookie|authorization|api_?key|otp)(_|$)/i;
const ADDRESS_KEY = /(^|_)(link|url|uri|e_?mail)$/i;
const MAX_TEXT = 500;
const MAX_DEPTH = 3;

function isUnsafeText(value: string): boolean {
  return value.length > MAX_TEXT || value.includes("://") || value.includes("@");
}

function sanitizeValue(value: unknown, depth: number): { keep: boolean; value?: unknown } {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return { keep: true, value };
  }
  if (typeof value === "string") {
    return isUnsafeText(value) ? { keep: false } : { keep: true, value };
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return { keep: false };
    const items = value
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item.keep)
      .map((item) => item.value);
    return { keep: true, value: items };
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return { keep: false };
    return { keep: true, value: sanitizeObject(value as Record<string, unknown>, depth + 1) };
  }
  return { keep: false };
}

function sanitizeObject(input: Record<string, unknown>, depth: number): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (SECRET_KEY.test(key) || ADDRESS_KEY.test(key)) continue;
    const result = sanitizeValue(raw, depth);
    if (result.keep) output[key] = result.value;
  }
  return output;
}

/**
 * What may be stored next to an audit event. An allow-list of shapes rather
 * than trust in the caller: a key that names a credential or an address is
 * dropped, and so is any text that looks like a URL or an email address, or
 * that is long enough to be content rather than a label.
 */
export function sanitizeAuditDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  return details ? sanitizeObject(details, 0) : {};
}

/**
 * Records one administrative event. Returns whether the row was stored.
 *
 * Never throws: the action it describes has already happened (or already
 * failed), and an audit outage must not change what the administrator is
 * told. A structured server log line is always written, so an event that
 * could not be stored is still visible in the platform logs.
 */
export async function logAdminEvent(event: AdminAuditEvent): Promise<boolean> {
  const outcome = event.outcome ?? "success";
  const actorType = event.actorType ?? "user";
  let stored = false;

  try {
    if (event.organizationId) {
      const svc = createServiceClientStatic();
      const { error } = await svc.from("hd_admin_audit_logs").insert({
        organization_id: event.organizationId,
        actor_id: event.actorId,
        actor_type: actorType,
        action: event.action,
        target_type: event.targetType ?? null,
        target_id: event.targetId ?? null,
        outcome,
        details: sanitizeAuditDetails(event.details),
      });
      if (error) {
        console.error("[admin-audit] event not stored", { action: event.action, code: error.code ?? null });
      } else {
        stored = true;
      }
    }
  } catch {
    // The cause may carry configuration detail; the action name is enough to
    // find the event in the log line below.
    console.error("[admin-audit] event not stored", { action: event.action, code: "exception" });
  }

  console.info("[audit] admin event", {
    action: event.action,
    outcome,
    actor_type: actorType,
    actor_id: event.actorId,
    organization_id: event.organizationId ?? null,
    target_type: event.targetType ?? null,
    target_id: event.targetId ?? null,
    stored,
  });

  return stored;
}

/**
 * An access or recovery link was issued. Keeps the Phase 0 structured log
 * line and adds the persistent record. Neither carries the link or an email
 * address: linkIssuanceLogEntry has no field that could hold one.
 */
export async function recordLinkIssuance(input: Parameters<typeof linkIssuanceLogEntry>[0]): Promise<boolean> {
  logLinkIssuance(input);
  const entry = linkIssuanceLogEntry(input);
  return logAdminEvent({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "access_link.issued",
    targetType: "user",
    targetId: input.targetUserId,
    details: {
      source: entry.source,
      link_type: entry.link_type,
      email_delivered: entry.email_delivered,
      handed_to_admin: entry.handed_to_admin,
      reason: entry.reason,
    },
  });
}
