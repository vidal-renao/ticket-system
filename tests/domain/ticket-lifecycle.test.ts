import { describe, expect, it } from "vitest";
import {
  ACTIVE_TICKET_STATUSES,
  canonicalToLegacyStatus,
  legacyToCanonicalStatus,
  validateTicketTransition,
} from "../../lib/ticket-lifecycle";
import { buildReopenedSlaPatch } from "../../lib/sla";

describe("ticket lifecycle", () => {
  it("allows terminal tickets to resume in progress", () => {
    expect(validateTicketTransition(
      { status: "resolved", assigned_to: "agent-a" },
      { status: "in_progress", assigned_to: "agent-a" }
    ).ok).toBe(true);
  });

  it("rejects skipping directly from a new ticket to resolved", () => {
    expect(validateTicketTransition(
      { status: "open", assigned_to: null },
      { status: "resolved", assigned_to: null }
    ).ok).toBe(false);
  });

  it("preserves each waiting reason through the canonical mapping", () => {
    expect(legacyToCanonicalStatus("pending_customer")).toBe("waiting_customer");
    expect(legacyToCanonicalStatus("pending_third_party")).toBe("waiting_third_party");
    expect(canonicalToLegacyStatus("waiting_customer")).toBe("pending_customer");
    expect(canonicalToLegacyStatus("waiting_third_party")).toBe("pending_third_party");
  });

  it("keeps both waiting reasons in active work", () => {
    expect(ACTIVE_TICKET_STATUSES).toContain("pending_customer");
    expect(ACTIVE_TICKET_STATUSES).toContain("pending_third_party");
  });

  it("starts a fresh resolution window when reopened", () => {
    const reopenedAt = new Date("2026-07-18T10:00:00.000Z");
    const patch = buildReopenedSlaPatch(
      {
        created_at: "2026-07-01T10:00:00.000Z",
        response_due_at: "2026-07-01T12:00:00.000Z",
        sla_first_response_due: null,
        sla_response_breached: false,
      },
      { id: "sla-high", first_response_hours: 2, resolution_hours: 8 },
      reopenedAt
    );

    expect(patch).toMatchObject({
      status: "in_progress",
      resolved_at: null,
      closed_at: null,
      resolution_due_at: "2026-07-18T18:00:00.000Z",
      sla_resolution_breached: false,
      sla_breached: false,
    });
  });
});
