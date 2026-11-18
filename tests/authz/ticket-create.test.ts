import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";

/**
 * REQ-F1-04 (code half): the portal insert goes through service_role, with the
 * tenant and the author taken from the authenticated profile. The session
 * client is only allowed to answer "who is this?" -- any table access through
 * it fails the test, because after 202611170003 the database refuses it too.
 */
const service = createFakeSupabase(new FakeDb());
const sessionFrom = vi.fn();
const sessionClient = { auth: { getUser: service.getUser }, from: sessionFrom };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => sessionClient,
  createServiceClientStatic: () => service.client,
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ delivered: false, reason: "not_configured" })),
  getAuthUserEmail: vi.fn(async () => null),
  ticketEmailSubject: () => "subject",
}));
const findAutomaticAssignment = vi.fn();
vi.mock("@/lib/ai/triage-runner", () => ({
  findAutomaticAssignment: (...args: unknown[]) => findAutomaticAssignment(...args),
  runAITriage: vi.fn(async () => {}),
  scheduleBackground: vi.fn(),
}));

const ORG_A = "00000000-0000-4000-8000-0000000000a0";
const ORG_B = "00000000-0000-4000-8000-0000000000b0";
const CUSTOMER = "00000000-0000-4000-8000-0000000000a4";

function request(body: unknown) {
  return new Request("http://localhost/api/tickets", { method: "POST", body: JSON.stringify(body) });
}

async function create(body: unknown = { title: "VPN down", description: "Cannot connect since 8am" }) {
  const { POST } = await import("../../app/api/tickets/route");
  return POST(request(body));
}

beforeEach(() => {
  service.db.reset();
  service.db.seed("hd_profiles", [
    { id: CUSTOMER, organization_id: ORG_A, role: "customer", is_active: true },
    { id: "agent-a", organization_id: ORG_A, role: "agent", is_active: true },
    { id: "admin-a", organization_id: ORG_A, role: "admin", is_active: true },
    { id: "orphan", organization_id: null, role: "customer", is_active: true },
  ]);
  service.db.seed("organizations", [{ id: ORG_A, support_email: null }]);
  service.db.seed("hd_tickets", []);
  service.signIn(CUSTOMER);
  sessionFrom.mockImplementation(() => {
    throw new Error("the user-session client must not read or write tables in this route");
  });
  findAutomaticAssignment.mockResolvedValue({ assignedTo: null, categoryId: null, unassignedReason: "no_match" });
});

describe("POST /api/tickets", () => {
  it("401 without a session, and nothing is written", async () => {
    service.signIn(null);
    expect((await create()).status).toBe(401);
    expect(service.db.rows("hd_tickets")).toHaveLength(0);
  });

  it.each([["agent-a"], ["admin-a"]])("403 for staff (%s): portal tickets are created by customers", async (userId) => {
    service.signIn(userId);
    expect((await create()).status).toBe(403);
    expect(service.db.rows("hd_tickets")).toHaveLength(0);
  });

  it("400 for a customer that belongs to no organization", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.signIn("orphan");
    expect((await create()).status).toBe(400);
    expect(service.db.rows("hd_tickets")).toHaveLength(0);
  });

  it("a customer creates a ticket through the service client, as themselves, in their own organization", async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(sessionFrom).not.toHaveBeenCalled();

    const [row] = service.db.rows("hd_tickets");
    expect(row).toMatchObject({
      title: "VPN down",
      created_by: CUSTOMER,
      organization_id: ORG_A,
      status: "open",
      source: "portal",
    });
    expect((await response.json()).ticket.created_by).toBe(CUSTOMER);
  });

  it("ignores organization_id, created_by, status and assigned_to sent by the client", async () => {
    const response = await create({
      title: "VPN down",
      description: "Cannot connect",
      organization_id: ORG_B,
      created_by: "admin-a",
      status: "closed",
      assigned_to: "agent-a",
      sla_breached: true,
    });
    expect(response.status).toBe(201);
    const [row] = service.db.rows("hd_tickets");
    expect(row).toMatchObject({ created_by: CUSTOMER, organization_id: ORG_A, status: "open" });
    expect(row.assigned_to).toBeUndefined();
    expect(row.sla_breached).toBeUndefined();
  });

  it("answers 500 with a generic message when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service.db.fail("hd_tickets", "insert", { code: "23503", message: "insert violates fk hd_tickets_created_by_fkey" });
    const response = await create();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("fkey");
  });
});
