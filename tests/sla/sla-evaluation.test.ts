import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";

const fake = createFakeSupabase(new FakeDb());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
  createServiceClientStatic: () => fake.client,
}));

import {
  addHours,
  applySlaAssessment,
  assessSla,
  buildReopenedSlaPatch,
  buildSlaDeadlinePatch,
  ensureSlaDeadlines,
  getSlaPolicyForTicket,
  type SlaTicketState,
} from "@/lib/sla";

const ORG = "org-a";
const OTHER_ORG = "org-b";
const NOW = new Date("2026-11-17T12:00:00.000Z");
const CREATED = "2026-11-17T08:00:00.000Z";

function ticket(overrides: Partial<SlaTicketState> = {}): SlaTicketState {
  return {
    id: "t-1",
    ticket_number: 7,
    organization_id: ORG,
    priority: "high",
    status: "in_progress",
    created_at: CREATED,
    resolved_at: null,
    assigned_to: "agent-1",
    response_due_at: "2026-11-17T09:00:00.000Z",
    resolution_due_at: "2026-11-17T16:00:00.000Z",
    first_agent_response_at: "2026-11-17T08:30:00.000Z",
    ...overrides,
  };
}

function seed(tickets: SlaTicketState[] = [ticket()]) {
  fake.db.reset();
  fake.db.seed("hd_tickets", tickets as unknown as Record<string, unknown>[]);
  fake.db.seed("hd_profiles", [
    { id: "agent-1", organization_id: ORG, role: "agent", is_active: true },
    { id: "admin-1", organization_id: ORG, role: "admin", is_active: true },
    { id: "admin-2", organization_id: ORG, role: "admin", is_active: true },
    { id: "admin-frozen", organization_id: ORG, role: "admin", is_active: false },
    { id: "manager-1", organization_id: ORG, role: "manager", is_active: true },
    { id: "admin-b", organization_id: OTHER_ORG, role: "admin", is_active: true },
  ]);
  fake.db.seed("hd_notifications", []);
  fake.db.seed("hd_ticket_audit_logs", []);
}

const notified = (type: string) =>
  fake.db.rows("hd_notifications").filter((row) => row.type === type).map((row) => row.user_id).sort();

beforeEach(() => seed());

describe("assessSla (fixed clock)", () => {
  it("is not breached while both deadlines are in the future", () => {
    const result = assessSla(ticket({ first_agent_response_at: null, response_due_at: "2026-11-17T13:00:00.000Z" }), NOW);
    expect(result).toEqual({
      responseBreached: false,
      resolutionBreached: false,
      responseMet: null,
      resolutionMet: null,
      breached: false,
    });
  });

  it("breaches the response SLA once the deadline passes with no reply", () => {
    const result = assessSla(ticket({ first_agent_response_at: null }), NOW);
    expect(result.responseBreached).toBe(true);
    expect(result.responseMet).toBeNull();
    expect(result.breached).toBe(true);
  });

  it("is exactly on the deadline: not breached", () => {
    const result = assessSla(ticket({ first_agent_response_at: null, response_due_at: NOW.toISOString() }), NOW);
    expect(result.responseBreached).toBe(false);
  });

  it("records a response met when the first reply was in time, whatever the clock says now", () => {
    const result = assessSla(ticket(), new Date("2027-01-01T00:00:00Z"));
    expect(result.responseBreached).toBe(false);
    expect(result.responseMet).toBe(true);
  });

  it("records a late first reply as breached", () => {
    const result = assessSla(ticket({ first_agent_response_at: "2026-11-17T09:00:01.000Z" }), NOW);
    expect(result.responseBreached).toBe(true);
    expect(result.responseMet).toBe(false);
  });

  it("falls back to the legacy first_response_at and sla_*_due columns", () => {
    const result = assessSla(
      ticket({
        first_agent_response_at: null,
        first_response_at: "2026-11-17T08:10:00.000Z",
        response_due_at: null,
        resolution_due_at: null,
        sla_first_response_due: "2026-11-17T09:00:00.000Z",
        sla_resolution_due: "2026-11-17T11:00:00.000Z",
      }),
      NOW
    );
    expect(result.responseMet).toBe(true);
    expect(result.resolutionBreached).toBe(true);
  });

  it("breaches the resolution SLA for an open ticket past its deadline", () => {
    const result = assessSla(ticket({ resolution_due_at: "2026-11-17T11:59:59.000Z" }), NOW);
    expect(result.resolutionBreached).toBe(true);
    expect(result.resolutionMet).toBeNull();
  });

  it("REQ-F1-03: resolved after the deadline is breached, using the real resolution time", () => {
    const result = assessSla(
      ticket({ status: "resolved", resolved_at: "2026-11-17T16:00:01.000Z" }),
      new Date("2026-11-17T16:00:02.000Z")
    );
    expect(result.resolutionBreached).toBe(true);
    expect(result.resolutionMet).toBe(false);
  });

  it("REQ-F1-03: resolved before the deadline is met, even when evaluated much later", () => {
    const result = assessSla(
      ticket({ status: "resolved", resolved_at: "2026-11-17T15:59:59.000Z" }),
      new Date("2026-12-01T00:00:00Z")
    );
    expect(result.resolutionBreached).toBe(false);
    expect(result.resolutionMet).toBe(true);
  });

  it("a resolved ticket with no resolved_at is judged at the evaluation time, never assumed on time", () => {
    const late = assessSla(ticket({ status: "closed", resolved_at: null }), new Date("2026-11-17T17:00:00Z"));
    expect(late.resolutionBreached).toBe(true);
    expect(late.resolutionMet).toBe(false);
    const early = assessSla(ticket({ status: "closed", resolved_at: null }), NOW);
    expect(early.resolutionMet).toBe(true);
  });

  it("has nothing to assess without deadlines", () => {
    const result = assessSla(ticket({ response_due_at: null, resolution_due_at: null }), NOW);
    expect(result.breached).toBe(false);
    expect(result.responseMet).toBeNull();
    expect(result.resolutionMet).toBeNull();
  });
});

describe("deadline helpers", () => {
  const policy = { id: "p-1", first_response_hours: 4, resolution_hours: 24 };

  it("addHours accepts a string or a Date", () => {
    expect(addHours(CREATED, 4)).toBe("2026-11-17T12:00:00.000Z");
    expect(addHours(new Date(CREATED), 0.5)).toBe("2026-11-17T08:30:00.000Z");
  });

  it("buildSlaDeadlinePatch returns nothing without a policy", () => {
    expect(buildSlaDeadlinePatch(ticket(), null)).toEqual({});
  });

  it("buildSlaDeadlinePatch preserves existing deadlines by default and recomputes on demand", () => {
    expect(buildSlaDeadlinePatch(ticket(), policy).resolution_due_at).toBe("2026-11-17T16:00:00.000Z");
    expect(buildSlaDeadlinePatch(ticket(), policy, { preserveExisting: false })).toEqual({
      sla_policy_id: "p-1",
      response_due_at: "2026-11-17T12:00:00.000Z",
      resolution_due_at: "2026-11-18T08:00:00.000Z",
      sla_first_response_due: "2026-11-17T12:00:00.000Z",
      sla_resolution_due: "2026-11-18T08:00:00.000Z",
    });
  });

  it("buildReopenedSlaPatch restarts the resolution clock and keeps the response verdict", () => {
    const patch = buildReopenedSlaPatch(
      { created_at: CREATED, response_due_at: "2026-11-17T09:00:00.000Z", sla_response_breached: true },
      policy,
      NOW
    );
    expect(patch).toMatchObject({
      status: "in_progress",
      resolved_at: null,
      resolution_due_at: "2026-11-18T12:00:00.000Z",
      sla_resolution_breached: false,
      sla_resolution_met: null,
      sla_response_breached: true,
      sla_breached: true,
    });
    expect(buildReopenedSlaPatch({ created_at: CREATED }, null, NOW).resolution_due_at).toBeNull();
  });

  it("getSlaPolicyForTicket reads the active policy of that organization and priority", async () => {
    fake.db.seed("sla_policies", [
      { id: "p-b", organization_id: OTHER_ORG, priority: "high", is_active: true, first_response_hours: 1, resolution_hours: 2 },
      { id: "p-a", organization_id: ORG, priority: "high", is_active: true, first_response_hours: 4, resolution_hours: 24 },
    ]);
    expect((await getSlaPolicyForTicket(fake.client, ORG, "high"))?.id).toBe("p-a");
    expect(await getSlaPolicyForTicket(fake.client, ORG, "low")).toBeNull();
  });

  it("ensureSlaDeadlines leaves a ticket with deadlines alone and fills a ticket without them", async () => {
    expect(await ensureSlaDeadlines(fake.client, ticket())).toEqual(ticket());
    expect(fake.db.opsFor("hd_tickets", "update")).toHaveLength(0);

    seed([ticket({ response_due_at: null, resolution_due_at: null })]);
    fake.db.seed("sla_policies", [
      { id: "p-a", organization_id: ORG, priority: "high", is_active: true, first_response_hours: 4, resolution_hours: 24 },
    ]);
    const filled = await ensureSlaDeadlines(fake.client, ticket({ response_due_at: null, resolution_due_at: null }));
    expect(filled.resolution_due_at).toBe("2026-11-18T08:00:00.000Z");
    const [update] = fake.db.opsFor("hd_tickets", "update");
    expect(update.filters).toContainEqual({ kind: "eq", column: "organization_id", value: ORG });
  });

  it("ensureSlaDeadlines returns the ticket untouched when the organization has no policy", async () => {
    const bare = ticket({ response_due_at: null, resolution_due_at: null });
    expect(await ensureSlaDeadlines(fake.client, bare)).toEqual(bare);
  });
});

describe("applySlaAssessment", () => {
  it("writes the flags with an explicit tenant predicate", async () => {
    await applySlaAssessment(fake.client, ticket(), null, "system", { now: NOW });
    const [update] = fake.db.opsFor("hd_tickets", "update");
    expect(update.filters).toEqual([
      { kind: "eq", column: "id", value: "t-1" },
      { kind: "eq", column: "organization_id", value: ORG },
    ]);
    expect(update.values).toEqual({
      sla_response_breached: false,
      sla_resolution_breached: false,
      sla_breached: false,
      sla_first_response_met: true,
    });
  });

  it("REQ-F1-03: a ticket resolved late is stored as breached and not met", async () => {
    const late = ticket({ status: "resolved", resolved_at: "2026-11-17T18:00:00.000Z" });
    seed([late]);
    await applySlaAssessment(fake.client, late, "admin-1", "admin", { now: new Date("2026-11-17T18:00:01Z") });
    expect(fake.db.rows("hd_tickets")[0]).toMatchObject({
      sla_resolution_breached: true,
      sla_resolution_met: false,
      sla_breached: true,
    });
  });

  it("REQ-F1-03: a ticket resolved in time is stored as met", async () => {
    const onTime = ticket({ status: "resolved", resolved_at: "2026-11-17T15:00:00.000Z" });
    seed([onTime]);
    await applySlaAssessment(fake.client, onTime, "admin-1", "admin", { now: new Date("2026-11-20T00:00:00Z") });
    expect(fake.db.rows("hd_tickets")[0]).toMatchObject({
      sla_resolution_breached: false,
      sla_resolution_met: true,
      sla_breached: false,
    });
  });

  it("REQ-F1-02: a first breach notifies the assignee and every active admin of that organization", async () => {
    const breached = ticket({ first_agent_response_at: null });
    await applySlaAssessment(fake.client, breached, null, "system", { now: NOW });
    expect(notified("sla.response_breached")).toEqual(["admin-1", "admin-2", "agent-1"]);
    expect(notified("sla.resolution_breached")).toEqual([]);
    expect(fake.db.rows("hd_ticket_audit_logs").map((row) => row.action)).toEqual(["ticket.sla_response_breached"]);
  });

  it("an unassigned ticket also reaches the managers, as before", async () => {
    const breached = ticket({ first_agent_response_at: null, assigned_to: null });
    await applySlaAssessment(fake.client, breached, null, "system", { now: NOW });
    expect(notified("sla.response_breached")).toEqual(["admin-1", "admin-2", "manager-1"]);
  });

  it("REQ-F1-02: running again does not notify or audit twice", async () => {
    const breached = ticket({ first_agent_response_at: null, resolution_due_at: "2026-11-17T10:00:00.000Z" });
    for (let run = 0; run < 3; run += 1) {
      await applySlaAssessment(fake.client, breached, null, "system", { now: NOW });
    }
    expect(notified("sla.response_breached")).toEqual(["admin-1", "admin-2", "agent-1"]);
    expect(notified("sla.resolution_breached")).toEqual(["admin-1", "admin-2", "agent-1"]);
    expect(fake.db.rows("hd_ticket_audit_logs")).toHaveLength(2);
  });

  it("an admin who joins after the breach is notified once, the others are not notified again", async () => {
    const breached = ticket({ first_agent_response_at: null });
    await applySlaAssessment(fake.client, breached, null, "system", { now: NOW });
    fake.db.rows("hd_profiles").push({ id: "admin-3", organization_id: ORG, role: "admin", is_active: true });
    await applySlaAssessment(fake.client, breached, null, "system", { now: NOW });
    expect(notified("sla.response_breached")).toEqual(["admin-1", "admin-2", "admin-3", "agent-1"]);
  });

  it("treats the database uniqueness guard (23505) as already notified, without failing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.db.fail("hd_notifications", "insert", { code: "23505", message: "duplicate key" });
    const breached = ticket({ first_agent_response_at: null });
    await expect(applySlaAssessment(fake.client, breached, null, "system", { now: NOW })).resolves.toMatchObject({
      responseBreached: true,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("logs, without ticket content, when a notification cannot be written for another reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.db.fail("hd_notifications", "insert", { code: "XX000", message: "boom" });
    await applySlaAssessment(fake.client, ticket({ first_agent_response_at: null }), null, "system", { now: NOW });
    expect(error).toHaveBeenCalled();
    expect(fake.db.rows("hd_tickets")[0].sla_response_breached).toBe(true);
  });

  it("a ticket already flagged as breached costs no write, no audit lookup and no notification lookup", async () => {
    const known = ticket({
      first_agent_response_at: null,
      sla_response_breached: true,
      sla_resolution_breached: false,
      sla_breached: true,
    });
    await applySlaAssessment(fake.client, known, null, "system", { now: NOW });
    expect(fake.db.ops).toHaveLength(0);
  });

  it("notifies before it stores the flag, so an interrupted run retries instead of losing the notice", async () => {
    await applySlaAssessment(fake.client, ticket({ first_agent_response_at: null }), null, "system", { now: NOW });
    const firstNotification = fake.db.ops.findIndex((op) => op.table === "hd_notifications" && op.op === "insert");
    const flagUpdate = fake.db.ops.findIndex((op) => op.table === "hd_tickets" && op.op === "update");
    expect(firstNotification).toBeGreaterThan(-1);
    expect(firstNotification).toBeLessThan(flagUpdate);
  });
});
