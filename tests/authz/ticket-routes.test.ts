import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";
import { describeAuthzMatrix } from "../helpers/authz-matrix";

/** REQ-F1-08: PATCH /api/tickets/[id] and POST /api/comments. */
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

const ORG_A = "00000000-0000-4000-8000-0000000000a0";
const ORG_B = "00000000-0000-4000-8000-0000000000b0";
const ADMIN_A = "admin-a";
const AGENT_A = "agent-a";
const AGENT_A2 = "agent-a2";
const MANAGER_A = "manager-a";
const CUSTOMER_A = "customer-a";
const CUSTOMER_A2 = "customer-a2";
const ADMIN_B = "admin-b";
const AGENT_B = "agent-b";
const CUSTOMER_B = "customer-b";
const TICKET = "00000000-0000-4000-8000-000000007c01";

let snapshot = "";
const state = () =>
  JSON.stringify({ tickets: fake.db.rows("hd_tickets"), comments: fake.db.rows("hd_ticket_comments") });
const ticket = () => fake.db.rows("hd_tickets")[0];
function expectUntouched() {
  expect(state()).toBe(snapshot);
  expect(fake.db.rows("hd_ticket_audit_logs")).toHaveLength(0);
  expect(fake.db.rows("hd_notifications")).toHaveLength(0);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake.db.reset();
  fake.db.seed(
    "hd_profiles",
    [
      [ADMIN_A, ORG_A, "admin"],
      [AGENT_A, ORG_A, "agent"],
      [AGENT_A2, ORG_A, "agent"],
      [MANAGER_A, ORG_A, "manager"],
      [CUSTOMER_A, ORG_A, "customer"],
      [CUSTOMER_A2, ORG_A, "customer"],
      [ADMIN_B, ORG_B, "admin"],
      [AGENT_B, ORG_B, "agent"],
      [CUSTOMER_B, ORG_B, "customer"],
    ].map(([id, organization_id, role]) => ({ id, organization_id, role, is_active: true }))
  );
  fake.db.seed("hd_tickets", [
    {
      id: TICKET,
      ticket_number: 41,
      title: "Laptop will not boot",
      organization_id: ORG_A,
      created_by: CUSTOMER_A,
      assigned_to: AGENT_A,
      priority: "medium",
      status: "open",
      review_status: "not_requested",
      routing_override: false,
      deleted_at: null,
      created_at: "2026-11-17T08:00:00.000Z",
      resolved_at: null,
      first_response_at: null,
      first_agent_response_at: null,
      response_due_at: "2099-01-01T00:00:00.000Z",
      resolution_due_at: "2099-01-02T00:00:00.000Z",
    },
  ]);
  fake.db.seed("hd_ticket_comments", []);
  fake.db.seed("hd_ticket_audit_logs", []);
  fake.db.seed("hd_notifications", []);
  snapshot = state();
});

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/tickets/x", { method: "PATCH", body: JSON.stringify(body) });

describeAuthzMatrix({
  route: "PATCH /api/tickets/[id]",
  signIn: fake.signIn,
  call: async () => {
    const { PATCH } = await import("../../app/api/tickets/[id]/route");
    return PATCH(patchRequest({ status: "in_progress" }), { params: Promise.resolve({ id: TICKET }) });
  },
  wrongRole: [
    { userId: CUSTOMER_A, status: 403, label: "the ticket's own customer" },
    { userId: MANAGER_A, status: 403, label: "manager (read-only workflow)" },
    { userId: AGENT_A2, status: 403, label: "an agent the ticket is not assigned to" },
  ],
  otherOrganization: { userId: ADMIN_B, status: 404 },
  allowed: {
    userId: AGENT_A,
    status: 200,
    verify: () => {
      expect(ticket().status).toBe("in_progress");
      const updates = fake.db.opsFor("hd_tickets", "update");
      expect(updates.length).toBeGreaterThan(0);
      for (const update of updates) {
        expect(update.filters).toContainEqual({ kind: "eq", column: "organization_id", value: ORG_A });
      }
    },
  },
  expectUntouched,
});

describe("PATCH /api/tickets/[id] — details", () => {
  async function patch(userId: string, body: unknown, id = TICKET) {
    fake.signIn(userId);
    const { PATCH } = await import("../../app/api/tickets/[id]/route");
    return PATCH(patchRequest(body), { params: Promise.resolve({ id }) });
  }

  it("an agent of another organization gets 404, also by ticket number", async () => {
    expect((await patch(AGENT_B, { status: "in_progress" })).status).toBe(404);
    expect((await patch(AGENT_B, { status: "in_progress" }, "41")).status).toBe(404);
    expectUntouched();
  });

  it("an agent cannot reassign, reprioritise or move the ticket to another organization", async () => {
    for (const body of [{ assigned_to: AGENT_A2 }, { priority: "critical" }, { organization_id: ORG_B }]) {
      const response = await patch(AGENT_A, body);
      expect([400, 403]).toContain(response.status);
    }
    expectUntouched();
  });

  it("an administrator cannot assign the ticket to an agent of another organization", async () => {
    expect((await patch(ADMIN_A, { assigned_to: AGENT_B })).status).toBe(400);
    expectUntouched();
  });

  it("an administrator of the same organization may reassign", async () => {
    expect((await patch(ADMIN_A, { assigned_to: AGENT_A2 })).status).toBe(200);
    expect(ticket().assigned_to).toBe(AGENT_A2);
  });

  it("a soft-deleted ticket is not found", async () => {
    ticket().deleted_at = "2026-11-01T00:00:00Z";
    snapshot = state();
    expect((await patch(ADMIN_A, { priority: "high" })).status).toBe(404);
    expectUntouched();
  });
});

const commentRequest = (body: unknown) =>
  new Request("http://localhost/api/comments", { method: "POST", body: JSON.stringify(body) });

describeAuthzMatrix({
  route: "POST /api/comments",
  signIn: fake.signIn,
  call: async () => {
    const { POST } = await import("../../app/api/comments/route");
    return POST(commentRequest({ ticket_id: TICKET, content: "Any news?" }));
  },
  wrongRole: [
    { userId: CUSTOMER_A2, status: 403, label: "another customer of the same organization" },
    { userId: AGENT_A2, status: 403, label: "an agent the ticket is not assigned to" },
  ],
  otherOrganization: { userId: CUSTOMER_B, status: 404 },
  allowed: {
    userId: CUSTOMER_A,
    status: 201,
    verify: () => {
      expect(fake.db.rows("hd_ticket_comments")).toHaveLength(1);
      expect(fake.db.rows("hd_ticket_comments")[0]).toMatchObject({
        ticket_id: TICKET,
        author_id: CUSTOMER_A,
        is_internal: false,
      });
    },
  },
  expectUntouched,
});

describe("POST /api/comments — details", () => {
  async function comment(userId: string, body: Record<string, unknown>) {
    fake.signIn(userId);
    const { POST } = await import("../../app/api/comments/route");
    return POST(commentRequest({ ticket_id: TICKET, content: "text", ...body }));
  }

  it.each([[ADMIN_B], [AGENT_B]])("staff of another organization (%s) get 404, not 403", async (userId) => {
    expect((await comment(userId, {})).status).toBe(404);
    expectUntouched();
  });

  it("a customer asking for an internal note gets a public comment", async () => {
    expect((await comment(CUSTOMER_A, { is_internal: true })).status).toBe(201);
    expect(fake.db.rows("hd_ticket_comments")[0].is_internal).toBe(false);
  });

  it("a customer cannot change the status through a comment", async () => {
    expect((await comment(CUSTOMER_A, { status_after_comment: "in_progress" })).status).toBe(403);
    expectUntouched();
  });

  it("the author is the session, never an author_id from the body", async () => {
    expect((await comment(CUSTOMER_A, { author_id: ADMIN_A })).status).toBe(201);
    expect(fake.db.rows("hd_ticket_comments")[0].author_id).toBe(CUSTOMER_A);
  });

  it("the assigned agent may write an internal note; the first staff reply is stamped", async () => {
    expect((await comment(AGENT_A, { is_internal: false })).status).toBe(201);
    expect(ticket().first_agent_response_at).toBeTruthy();
  });

  it("a profile without an organization is refused", async () => {
    fake.db.rows("hd_profiles").push({ id: "orphan", organization_id: null, role: "agent", is_active: true });
    expect((await comment("orphan", {})).status).toBe(403);
    expectUntouched();
  });
});
