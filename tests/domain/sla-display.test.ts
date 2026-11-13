import { describe, expect, it } from "vitest";
import { deriveSlaDisplay, isFinalSlaState, type SlaDisplayTicket } from "../../lib/sla-display";

const H = 60 * 60 * 1000;
const CREATED = Date.parse("2026-11-13T08:00:00Z");
const iso = (offsetHours: number) => new Date(CREATED + offsetHours * H).toISOString();

// 4h response target, 24h resolution target.
const base: SlaDisplayTicket = {
  status: "open",
  created_at: iso(0),
  response_due_at: iso(4),
  resolution_due_at: iso(24),
  resolved_at: null,
  closed_at: null,
  first_response_at: null,
  first_agent_response_at: null,
};

describe("deriveSlaDisplay", () => {
  it("open ticket without a response counts both targets down", () => {
    const display = deriveSlaDisplay(base, CREATED + 1 * H);
    expect(display.response?.state).toBe("running");
    expect(display.resolution?.state).toBe("running");
    expect(display.overall).toBe("on_time");
  });

  it("flags an open response target inside its last hour as at risk", () => {
    const display = deriveSlaDisplay(base, CREATED + 3.5 * H);
    expect(display.response?.state).toBe("at_risk");
    expect(display.overall).toBe("at_risk");
  });

  it("open ticket past the response due date is breached while still counting resolution", () => {
    const display = deriveSlaDisplay(base, CREATED + 5 * H);
    expect(display.response?.state).toBe("overdue");
    expect(display.resolution?.state).toBe("running");
    expect(display.overall).toBe("breached");
  });

  it("a first response stops the response countdown and shows it as met", () => {
    const ticket = { ...base, status: "in_progress", first_response_at: iso(1), first_agent_response_at: iso(1) };
    // Long after the response due date: a met target must not turn into a breach.
    const display = deriveSlaDisplay(ticket, CREATED + 10 * H);
    expect(display.response).toEqual({ state: "met", dueAt: iso(4), completedAt: iso(1) });
    expect(display.resolution?.state).toBe("running");
    expect(display.overall).toBe("on_time");
  });

  it("a late first response is final and marks the SLA breached", () => {
    const ticket = { ...base, status: "in_progress", first_agent_response_at: iso(6) };
    const display = deriveSlaDisplay(ticket, CREATED + 7 * H);
    expect(display.response?.state).toBe("missed");
    expect(display.overall).toBe("breached");
  });

  it("resolved on time: both targets met, no live countdown, overall met", () => {
    const ticket = { ...base, status: "resolved", first_agent_response_at: iso(1), resolved_at: iso(5) };
    // Evaluated after the resolution due date has passed.
    const display = deriveSlaDisplay(ticket, CREATED + 48 * H);
    expect(display.response?.state).toBe("met");
    expect(display.resolution).toEqual({ state: "met", dueAt: iso(24), completedAt: iso(5) });
    expect(display.overall).toBe("met");
  });

  it("resolved late: resolution missed, overall breached", () => {
    const ticket = { ...base, status: "resolved", first_agent_response_at: iso(1), resolved_at: iso(30) };
    const display = deriveSlaDisplay(ticket, CREATED + 31 * H);
    expect(display.resolution?.state).toBe("missed");
    expect(display.overall).toBe("breached");
  });

  it("closed ticket (TK-0081 shape) is final: met, regardless of the clock", () => {
    const ticket = {
      ...base,
      status: "closed",
      first_response_at: iso(1),
      first_agent_response_at: iso(1),
      resolved_at: iso(2),
      closed_at: iso(2.1),
    };
    for (const now of [CREATED + 3 * H, CREATED + 100 * H]) {
      const display = deriveSlaDisplay(ticket, now);
      expect(display.response?.state).toBe("met");
      expect(display.resolution?.state).toBe("met");
      expect(display.overall).toBe("met");
    }
  });

  it("closed without resolved_at falls back to closed_at", () => {
    const ticket = { ...base, status: "closed", first_response_at: iso(1), closed_at: iso(26) };
    expect(deriveSlaDisplay(ticket, CREATED + 27 * H).resolution).toEqual({
      state: "missed",
      dueAt: iso(24),
      completedAt: iso(26),
    });
  });

  it("keeps a stored breach flag on a finished target", () => {
    const ticket = {
      ...base,
      status: "closed",
      first_response_at: iso(1),
      resolved_at: iso(2),
      sla_resolution_breached: true,
    };
    expect(deriveSlaDisplay(ticket, CREATED + 3 * H).resolution?.state).toBe("missed");
  });

  it("a ticket resolved before any public reply stops the response clock too", () => {
    const ticket = { ...base, status: "resolved", resolved_at: iso(2) };
    const display = deriveSlaDisplay(ticket, CREATED + 50 * H);
    expect(display.response?.state).toBe("met");
    expect(display.overall).toBe("met");
  });

  it("uses the legacy due-date columns when the new ones are empty", () => {
    const ticket = {
      ...base,
      response_due_at: null,
      resolution_due_at: null,
      sla_first_response_due: iso(4),
      sla_resolution_due: iso(24),
    };
    const display = deriveSlaDisplay(ticket, CREATED + 1 * H);
    expect(display.response?.dueAt).toBe(iso(4));
    expect(display.resolution?.dueAt).toBe(iso(24));
  });

  it("returns no rows and no badge without SLA deadlines", () => {
    const ticket = { ...base, response_due_at: null, resolution_due_at: null };
    expect(deriveSlaDisplay(ticket, CREATED)).toEqual({ response: null, resolution: null, overall: null });
  });

  it("marks only met and missed as final", () => {
    expect(isFinalSlaState("met")).toBe(true);
    expect(isFinalSlaState("missed")).toBe(true);
    expect(isFinalSlaState("running")).toBe(false);
    expect(isFinalSlaState("at_risk")).toBe(false);
    expect(isFinalSlaState("overdue")).toBe(false);
  });
});
