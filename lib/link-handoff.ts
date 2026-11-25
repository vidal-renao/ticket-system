/**
 * When may an access or recovery link be shown to the administrator?
 *
 * A link that signs somebody in is a credential. Returning it to the admin's
 * browser on every onboarding and every password reset put a working login
 * for another person into a response body, a browser tab and whatever logs
 * sit in between (audit 2026-11-16, SEC-02). DECISIONS.md ADR-016:
 *
 *   - never for an account that was linked rather than invited: it already
 *     has credentials of its own and was sent nothing;
 *   - otherwise only if the email carrying the link did NOT go out AND the
 *     deployment has opted in with ADMIN_LINK_HANDOFF=true (exactly "true").
 *
 * Pure on purpose: the three routes that issue links share this one rule.
 */
export type LinkHandoffKind = "invite" | "link_existing" | "recovery";

export type LinkHandoffReason =
  | "handed_to_admin"
  | "email_delivered"
  | "handoff_disabled"
  | "linked_account"
  | "no_link";

export interface LinkHandoffDecision {
  /** The link to put in the response, or null. */
  link: string | null;
  handedToAdmin: boolean;
  reason: LinkHandoffReason;
}

export function decideLinkHandoff(input: {
  kind: LinkHandoffKind;
  emailDelivered: boolean;
  /** Raw value of process.env.ADMIN_LINK_HANDOFF. */
  flag: string | undefined;
  link: string | null;
}): LinkHandoffDecision {
  const withhold = (reason: LinkHandoffReason): LinkHandoffDecision => ({
    link: null,
    handedToAdmin: false,
    reason,
  });

  if (input.kind === "link_existing") return withhold("linked_account");
  if (input.emailDelivered) return withhold("email_delivered");
  if (input.flag !== "true") return withhold("handoff_disabled");
  if (!input.link) return withhold("no_link");
  return { link: input.link, handedToAdmin: true, reason: "handed_to_admin" };
}

/**
 * Did GoTrue refuse an invitation because it could not send the mail?
 *
 * These are the only signals the Auth Admin API gives: the error code for the
 * mail rate limit, and the message GoTrue uses when its SMTP hand-off fails.
 * Anything else (duplicate address, invalid address, database error, the
 * general request rate limit) is a different problem and is not "email
 * failed".
 */
export function isInviteEmailFailure(
  error: { status?: number; code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "over_email_send_rate_limit") return true;
  const message = error.message ?? "";
  return /error sending [a-z ]*e-?mail/i.test(message) || /email rate limit exceeded/i.test(message);
}

/**
 * The audit record of a link being issued. Deliberately has no field that
 * could hold the link or an email address: ids, type and outcome only.
 */
export function linkIssuanceLogEntry(input: {
  source: string;
  actorId: string;
  targetUserId: string;
  organizationId: string | null;
  linkType: "invite" | "recovery";
  emailDelivered: boolean;
  decision: LinkHandoffDecision;
}) {
  return {
    event: "access_link_issued" as const,
    source: input.source,
    actor_id: input.actorId,
    target_user_id: input.targetUserId,
    organization_id: input.organizationId,
    link_type: input.linkType,
    email_delivered: input.emailDelivered,
    handed_to_admin: input.decision.handedToAdmin,
    reason: input.decision.reason,
  };
}

/**
 * Writes the issuance record to the structured server log.
 *
 * The persistent record is written by recordLinkIssuance() in
 * lib/admin-audit.ts (hd_admin_audit_logs), which calls this first; the log
 * line stays so the event is visible even if that table cannot be written.
 */
export function logLinkIssuance(input: Parameters<typeof linkIssuanceLogEntry>[0]) {
  console.info("[audit] access link issued", linkIssuanceLogEntry(input));
}
