import { describe, expect, it } from "vitest";
import {
  canForceClose,
  reviewStatusAfterForceClose,
  validateForceCloseReason,
  FORCE_CLOSE_REASON_MIN,
  FORCE_CLOSE_REASON_MAX,
} from "../../lib/force-close";

describe("a forced close must explain itself", () => {
  it("accepts a real explanation and stores it trimmed", () => {
    const result = validateForceCloseReason("  Duplicate of TK-0042, closing this one.  ");
    expect(result).toEqual({ ok: true, reason: "Duplicate of TK-0042, closing this one." });
  });

  it("rejects a missing reason", () => {
    expect(validateForceCloseReason(undefined)).toEqual({ ok: false, error: "reason_required" });
    expect(validateForceCloseReason(null)).toEqual({ ok: false, error: "reason_required" });
  });

  it("rejects whitespace dressed up as a reason", () => {
    expect(validateForceCloseReason("     ")).toEqual({ ok: false, error: "reason_required" });
    expect(validateForceCloseReason("\n\t")).toEqual({ ok: false, error: "reason_required" });
  });

  it("rejects a non-string, whatever the client sent", () => {
    expect(validateForceCloseReason(42)).toEqual({ ok: false, error: "reason_required" });
    expect(validateForceCloseReason({ reason: "x" })).toEqual({ ok: false, error: "reason_required" });
    expect(validateForceCloseReason(["because"])).toEqual({ ok: false, error: "reason_required" });
  });

  it("rejects something too short to be an explanation", () => {
    // "ok", "fixed", "n/a" -- the shrugs that make an audit trail useless.
    expect(validateForceCloseReason("n/a")).toEqual({ ok: false, error: "reason_too_short" });
    expect(validateForceCloseReason("x".repeat(FORCE_CLOSE_REASON_MIN - 1))).toEqual({
      ok: false,
      error: "reason_too_short",
    });
  });

  it("measures length after trimming, not before", () => {
    // Padding a shrug with spaces must not buy its way past the minimum.
    const padded = `   ${"x".repeat(FORCE_CLOSE_REASON_MIN - 1)}   `;
    expect(padded.length).toBeGreaterThan(FORCE_CLOSE_REASON_MIN);
    expect(validateForceCloseReason(padded)).toEqual({ ok: false, error: "reason_too_short" });
  });

  it("accepts exactly the minimum length", () => {
    const result = validateForceCloseReason("x".repeat(FORCE_CLOSE_REASON_MIN));
    expect(result.ok).toBe(true);
  });

  it("rejects an essay that would swamp the log", () => {
    expect(validateForceCloseReason("x".repeat(FORCE_CLOSE_REASON_MAX + 1))).toEqual({
      ok: false,
      error: "reason_too_long",
    });
    expect(validateForceCloseReason("x".repeat(FORCE_CLOSE_REASON_MAX)).ok).toBe(true);
  });
});

describe("what can be forced", () => {
  it("allows forcing from any live state, however early", () => {
    // The point of the escape hatch: a ticket stuck at intake can be closed
    // without walking it through execution and review first.
    for (const status of ["open", "in_progress", "pending_customer", "pending_third_party", "resolved"]) {
      expect(canForceClose(status)).toBe(true);
    }
  });

  it("refuses to re-close a closed ticket", () => {
    // Re-closing would write an audit entry describing a change that did not
    // happen.
    expect(canForceClose("closed")).toBe(false);
  });
});

describe("an outstanding review does not survive the close", () => {
  it("resolves a pending review", () => {
    // Closed *and* awaiting review is a state the cockpit cannot represent:
    // work pending on a ticket nobody will touch again.
    expect(reviewStatusAfterForceClose("pending")).toBe("approved");
  });

  it("leaves any other review status untouched", () => {
    expect(reviewStatusAfterForceClose("not_requested")).toBeNull();
    expect(reviewStatusAfterForceClose("approved")).toBeNull();
    expect(reviewStatusAfterForceClose("changes_requested")).toBeNull();
    expect(reviewStatusAfterForceClose(null)).toBeNull();
  });
});
