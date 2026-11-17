import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";

const fake = createFakeSupabase(new FakeDb());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
  createServiceClientStatic: () => fake.client,
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ delivered: false, reason: "not_configured" })),
  getAuthUserEmail: vi.fn(async () => null),
  ticketEmailSubject: () => "subject",
}));

const ORG = "org-a";
const TICKET = "t-1";
const DUE = "2026-11-17T16:00:00.000Z";

function seed(overrides: Record<string, unknown> = {}) {
  fake.db.reset();
  fake.db.seed("hd_profiles", [
    { id: "admin-1", organization_id: ORG, role: "admin", is_active: true },
    { id: "agent-1", organization_id: ORG, role: "agent", is_active: true },
    { id: "customer-1", organization_id: ORG, role: "customer", is_active: true },
  ]);
  fake.db.seed("hd_tickets", [
    {
      id: TICKET,
      ticket_number: 12,
      title: "Printer",
      organization_id: ORG,
      created_by: "customer-1",
      assigned_to: "agent-1",
      priority: "high",
      status: "in_progress",
      review_status: "pending",
      created_at: "2026-11-17T08:00:00.000Z",
      resolved_at: null,
      deleted_at: null,
      first_agent_response_at: "2026-11-17T08:30:00.000Z",
      response_due_at: "2026-11-17T12:00:00.000Z",
      resolution_due_at: DUE,
      sla_response_breached: false,
      sla_resolution_breached: false,
      sla_breached: false,
      sla_resolution_met: null,
      ...overrides,
    },
  ]);
  fake.signIn("admin-1");
}

const stored = () => fake.db.rows("hd_tickets")[0];
const params = { params: Promise.resolve({ id: TICKET }) };
const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.useFakeTimers();
  seed();
});
afterEach(() => vi.useRealTimers());

describe("REQ-F1-03: POST /api/tickets/[id]/review (approve)", () => {
  async function approve() {
    const { POST } = await import("../../app/api/tickets/[id]/review/route");
    return POST(post({ action: "approve" }), params);
  }

  it("approving after the resolution deadline stores the ticket as breached", async () => {
    vi.setSystemTime(new Date("2026-11-17T16:30:00.000Z"));
    expect((await approve()).status).toBe(200);
    expect(stored()).toMatchObject({
      status: "resolved",
      resolved_at: "2026-11-17T16:30:00.000Z",
      sla_resolution_breached: true,
      sla_resolution_met: false,
      sla_breached: true,
    });
  });

  it("approving before the deadline stores the ticket as met", async () => {
    vi.setSystemTime(new Date("2026-11-17T15:00:00.000Z"));
    expect((await approve()).status).toBe(200);
    expect(stored()).toMatchObject({
      status: "resolved",
      sla_resolution_breached: false,
      sla_resolution_met: true,
      sla_breached: false,
    });
  });

  it("a ticket the sweep had already flagged as breached stays breached and is marked not met", async () => {
    seed({ sla_resolution_breached: true, sla_breached: true });
    vi.setSystemTime(new Date("2026-11-17T17:00:00.000Z"));
    await approve();
    expect(stored()).toMatchObject({ sla_resolution_breached: true, sla_resolution_met: false });
  });

  it("still answers 200 when the SLA recomputation fails: the approval already happened", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.setSystemTime(new Date("2026-11-17T16:30:00.000Z"));
    const { POST } = await import("../../app/api/tickets/[id]/review/route");
    const original = fake.client.from;
    // The first hd_profiles read is the route authorizing the caller; the
    // second belongs to the breach notification inside the recomputation.
    let profileReads = 0;
    fake.client.from = (table: string) => {
      if (table === "hd_profiles" && (profileReads += 1) > 1) throw new Error("network");
      return original(table);
    };
    try {
      expect((await POST(post({ action: "approve" }), params)).status).toBe(200);
    } finally {
      fake.client.from = original;
    }
    expect(stored().status).toBe("resolved");
    expect(error).toHaveBeenCalled();
  });

  it("requesting changes does not resolve and stores no resolution verdict", async () => {
    vi.setSystemTime(new Date("2026-11-17T15:00:00.000Z"));
    const { POST } = await import("../../app/api/tickets/[id]/review/route");
    expect((await POST(post({ action: "changes" }), params)).status).toBe(200);
    expect(stored()).toMatchObject({ status: "in_progress", sla_resolution_met: null });
  });
});

describe("REQ-F1-03: POST /api/tickets/[id]/force-close", () => {
  async function forceClose() {
    const { POST } = await import("../../app/api/tickets/[id]/force-close/route");
    return POST(post({ reason: "Customer confirmed by phone that the issue is gone." }), params);
  }

  it("a forced close after the deadline is stored as a breached resolution", async () => {
    vi.setSystemTime(new Date("2026-11-18T09:00:00.000Z"));
    expect((await forceClose()).status).toBe(200);
    expect(stored()).toMatchObject({
      status: "closed",
      resolved_at: "2026-11-18T09:00:00.000Z",
      sla_resolution_breached: true,
      sla_resolution_met: false,
    });
  });

  it("a forced close before the deadline is stored as met", async () => {
    vi.setSystemTime(new Date("2026-11-17T10:00:00.000Z"));
    expect((await forceClose()).status).toBe(200);
    expect(stored()).toMatchObject({ status: "closed", sla_resolution_breached: false, sla_resolution_met: true });
  });

  it("keeps the earlier resolution time of a ticket that was already resolved in time", async () => {
    seed({ status: "resolved", resolved_at: "2026-11-17T15:00:00.000Z", review_status: "approved" });
    vi.setSystemTime(new Date("2026-11-19T09:00:00.000Z"));
    expect((await forceClose()).status).toBe(200);
    expect(stored()).toMatchObject({
      resolved_at: "2026-11-17T15:00:00.000Z",
      sla_resolution_breached: false,
      sla_resolution_met: true,
    });
  });
});
