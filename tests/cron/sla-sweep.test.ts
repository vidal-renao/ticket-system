import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase, type Row } from "../helpers/fake-supabase";

const fake = createFakeSupabase(new FakeDb());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
  createServiceClientStatic: () => fake.client,
}));
const recoverMissingTriage = vi.fn();
vi.mock("@/lib/ai/triage-recovery", () => ({
  recoverMissingTriage: (...args: unknown[]) => recoverMissingTriage(...args),
}));

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-17T12:00:00.000Z");
const ORG = "org-a";

function activeTicket(index: number, overrides: Row = {}): Row {
  return {
    id: `t-${String(index).padStart(5, "0")}`,
    ticket_number: index,
    organization_id: ORG,
    priority: "medium",
    status: "open",
    assigned_to: "agent-1",
    created_at: "2026-11-17T08:00:00.000Z",
    resolved_at: null,
    deleted_at: null,
    first_agent_response_at: "2026-11-17T08:10:00.000Z",
    response_due_at: "2026-11-17T16:00:00.000Z",
    resolution_due_at: "2026-11-20T08:00:00.000Z",
    sla_response_breached: false,
    sla_resolution_breached: false,
    sla_breached: false,
    sla_first_response_met: true,
    sla_resolution_met: null,
    ...overrides,
  };
}

function seed(tickets: Row[]) {
  fake.db.reset();
  fake.db.seed("hd_tickets", tickets);
  fake.db.seed("hd_profiles", [
    { id: "agent-1", organization_id: ORG, role: "agent", is_active: true },
    { id: "admin-1", organization_id: ORG, role: "admin", is_active: true },
  ]);
  fake.db.seed("hd_notifications", []);
  fake.db.seed("hd_ticket_audit_logs", []);
  fake.db.seed("hd_cron_state", []);
  fake.db.unique(
    "hd_notifications",
    ["user_id", "ticket_id", "type"],
    (row) => String(row.type).startsWith("sla.")
  );
}

async function run(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  const { GET } = await import("../../app/api/cron/sla/route");
  const response = await GET(new Request("http://localhost/api/cron/sla", { headers }));
  return { status: response.status, body: await response.json() };
}

const pageReads = () =>
  fake.db.opsFor("hd_tickets", "select").filter((op) => op.filters.some((f) => f.kind === "in" && f.column === "status"));
const cursor = () => fake.db.rows("hd_cron_state").find((row) => row.job === "sla")?.cursor ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", SECRET);
  recoverMissingTriage.mockResolvedValue({ candidates: 0, recovered: 0, failed: 0 });
  seed([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/sla — sweep (REQ-F1-02)", () => {
  it("processes every active ticket beyond the old 500 limit, in keyset pages of 200 ordered by id", async () => {
    seed(Array.from({ length: 450 }, (_, i) => activeTicket(i + 1)));
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, assessed: 450, breached: 0, completed: true, pages: 3 });

    const reads = pageReads();
    expect(reads).toHaveLength(3);
    expect(reads[0].filters.some((f) => f.kind === "gt")).toBe(false);
    expect(reads[1].filters).toContainEqual({ kind: "gt", column: "id", value: "t-00200" });
    expect(reads[2].filters).toContainEqual({ kind: "gt", column: "id", value: "t-00400" });
    expect(cursor()).toBeNull();
  });

  it("skips resolved, closed and soft-deleted tickets", async () => {
    seed([
      activeTicket(1),
      activeTicket(2, { status: "resolved" }),
      activeTicket(3, { status: "closed" }),
      activeTicket(4, { deleted_at: "2026-11-01T00:00:00Z" }),
      activeTicket(5, { status: "pending_customer" }),
    ]);
    expect((await run()).body.assessed).toBe(2);
  });

  it("an unchanged ticket costs no write", async () => {
    seed([activeTicket(1), activeTicket(2)]);
    await run();
    expect(fake.db.opsFor("hd_tickets", "update")).toHaveLength(0);
  });

  it("flags a first breach, audits it and notifies the assignee and the admins", async () => {
    seed([activeTicket(1, { resolution_due_at: "2026-11-17T11:00:00.000Z" }), activeTicket(2)]);
    const { body } = await run();
    expect(body).toMatchObject({ assessed: 2, breached: 1 });
    expect(fake.db.rows("hd_tickets")[0]).toMatchObject({ sla_resolution_breached: true, sla_breached: true });
    expect(fake.db.rows("hd_notifications").map((row) => row.user_id).sort()).toEqual(["admin-1", "agent-1"]);
    expect(fake.db.rows("hd_ticket_audit_logs").map((row) => row.action)).toEqual(["ticket.sla_resolution_breached"]);
    const [update] = fake.db.opsFor("hd_tickets", "update");
    expect(update.filters).toContainEqual({ kind: "eq", column: "organization_id", value: ORG });
  });

  it("is idempotent: three consecutive runs notify and audit each breach exactly once", async () => {
    seed([
      activeTicket(1, { resolution_due_at: "2026-11-17T11:00:00.000Z" }),
      activeTicket(2, { first_agent_response_at: null, response_due_at: "2026-11-17T09:00:00.000Z", sla_first_response_met: null }),
    ]);
    await run();
    await run();
    const third = await run();
    expect(third.body.breached).toBe(2);
    expect(fake.db.rows("hd_notifications")).toHaveLength(4);
    expect(fake.db.rows("hd_ticket_audit_logs")).toHaveLength(2);
  });

  it("stops at the time budget, stores the cursor, and the next run continues from it", async () => {
    seed(Array.from({ length: 450 }, (_, i) => activeTicket(i + 1)));
    // Each page read costs 25 simulated seconds: the budget is gone when the
    // second page arrives, so only the first is processed.
    const original = fake.client.from;
    fake.client.from = (table: string) => {
      if (table === "hd_tickets") vi.setSystemTime(new Date(Date.now() + 25_000));
      return original(table);
    };
    let first;
    try {
      first = await run();
    } finally {
      fake.client.from = original;
    }
    expect(first.body).toMatchObject({ ok: true, completed: false, assessed: 200, pages: 2 });
    expect(cursor()).toBe("t-00200");

    fake.db.ops.length = 0;
    const second = await run();
    expect(second.body).toMatchObject({ completed: true, assessed: 250 });
    expect(pageReads()[0].filters).toContainEqual({ kind: "gt", column: "id", value: "t-00200" });
    expect(cursor()).toBeNull();
  });

  it("skips triage recovery, which calls the model, when the time budget is spent", async () => {
    seed(Array.from({ length: 450 }, (_, i) => activeTicket(i + 1)));
    const original = fake.client.from;
    fake.client.from = (table: string) => {
      if (table === "hd_tickets") vi.setSystemTime(new Date(Date.now() + 25_000));
      return original(table);
    };
    try {
      const { body } = await run();
      expect(body.triageRecovery).toBeNull();
    } finally {
      fake.client.from = original;
    }
    expect(recoverMissingTriage).not.toHaveBeenCalled();
  });

  it("works before the cursor table exists (code is deployed before the migration)", async () => {
    seed([activeTicket(1)]);
    fake.db.fail("hd_cron_state", "select", { code: "42P01", message: "relation does not exist" });
    fake.db.fail("hd_cron_state", "upsert", { code: "42P01", message: "relation does not exist" });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ assessed: 1, completed: true });
  });

  it("one ticket failing does not stop the sweep", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    seed([
      activeTicket(1, { resolution_due_at: "2026-11-17T11:00:00.000Z" }),
      activeTicket(2, { resolution_due_at: "2026-11-17T11:00:00.000Z" }),
    ]);
    const original = fake.client.from;
    let thrown = false;
    fake.client.from = (table: string) => {
      if (table === "hd_ticket_audit_logs" && !thrown) {
        thrown = true;
        throw new Error("transient");
      }
      return original(table);
    };
    let result;
    try {
      result = await run();
    } finally {
      fake.client.from = original;
    }
    expect(result.body).toMatchObject({ assessed: 1, failed: 1 });
    expect(error).toHaveBeenCalled();
  });

  it("answers 500 with a generic message when the ticket scan fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.db.fail("hd_tickets", "select", { message: "relation hd_tickets secret detail" });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });

  it("still closes resolutions the customer left unconfirmed for 48 hours", async () => {
    seed([
      activeTicket(1, { status: "resolved", resolved_at: "2026-11-15T11:00:00.000Z" }),
      activeTicket(2, { status: "resolved", resolved_at: "2026-11-17T11:00:00.000Z" }),
    ]);
    const { body } = await run();
    expect(body.autoClosed).toBe(1);
    expect(fake.db.rows("hd_tickets").map((row) => row.status)).toEqual(["closed", "resolved"]);
    expect(fake.db.rows("hd_ticket_audit_logs").map((row) => row.action)).toEqual(["ticket.auto_closed"]);
  });

  it("keeps the progress of a run whose second page fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed(Array.from({ length: 250 }, (_, i) => activeTicket(i + 1)));
    // The first page read succeeds; the second one fails.
    let reads = 0;
    const original = fake.client.from;
    fake.client.from = (table: string) => {
      if (table === "hd_tickets" && ++reads === 2) {
        fake.db.fail("hd_tickets", "select", { code: "57014", message: "statement timeout" }, { once: true });
      }
      return original(table);
    };
    let result;
    try {
      result = await run();
    } finally {
      fake.client.from = original;
    }
    expect(result.status).toBe(500);
    expect(cursor()).toBe("t-00200");
  });

  it("auto-closes with the tenant predicate on every write, one update per organization", async () => {
    seed([
      activeTicket(1, { status: "resolved", resolved_at: "2026-11-15T11:00:00.000Z" }),
      activeTicket(2, { status: "resolved", resolved_at: "2026-11-15T11:00:00.000Z", organization_id: "org-b" }),
    ]);
    const { body } = await run();
    expect(body.autoClosed).toBe(2);
    const updates = fake.db.opsFor("hd_tickets", "update");
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect(update.filters.some((f) => f.kind === "eq" && f.column === "organization_id")).toBe(true);
    }
  });

  it("skips triage recovery when a finished sweep already used more than 30 seconds", async () => {
    seed([activeTicket(1)]);
    const original = fake.client.from;
    let reads = 0;
    fake.client.from = (table: string) => {
      if (table === "hd_tickets" && ++reads === 1) vi.setSystemTime(new Date(Date.now() + 31_000));
      return original(table);
    };
    let result;
    try {
      result = await run();
    } finally {
      fake.client.from = original;
    }
    expect(result.body).toMatchObject({ completed: true, triageRecovery: null });
    expect(recoverMissingTriage).not.toHaveBeenCalled();
  });

  it("runs the full triage recovery only after a completed sweep", async () => {
    seed([activeTicket(1)]);
    await run();
    expect(recoverMissingTriage).toHaveBeenCalledTimes(1);
  });

  it("still runs triage recovery and reports it", async () => {
    recoverMissingTriage.mockResolvedValue({ candidates: 2, recovered: 1, failed: 1 });
    const { body } = await run();
    expect(body.triageRecovery).toEqual({ candidates: 2, recovered: 1, failed: 1 });
  });
});
