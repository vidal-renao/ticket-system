import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";
import { describeBearerMatrix } from "../helpers/authz-matrix";

/**
 * REQ-F1-08 for the endpoints that have no session: the two guarded by a
 * shared secret (cron/sla, email/inbound) and public registration.
 */
const fake = createFakeSupabase(new FakeDb());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
  createServiceClientStatic: () => fake.client,
}));
const signUp = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { signUp } }),
}));
const recoverMissingTriage = vi.fn();
vi.mock("@/lib/ai/triage-recovery", () => ({
  recoverMissingTriage: (...args: unknown[]) => recoverMissingTriage(...args),
}));

const SECRET = "c".repeat(48);
const ORG_A = "00000000-0000-4000-8000-0000000000a0";
const ORG_B = "00000000-0000-4000-8000-0000000000b0";
const CUSTOMER_A = "00000000-0000-4000-8000-0000000000a4";
const AGENT_B = "00000000-0000-4000-8000-0000000000b2";
const NEW_USER = "00000000-0000-4000-8000-0000000000ff";

let snapshot = "";
const state = () =>
  JSON.stringify(
    ["hd_tickets", "hd_ticket_comments", "hd_profiles", "hd_notifications", "hd_ticket_audit_logs", "hd_customers_info"].map(
      (table) => fake.db.rows(table)
    )
  );
function expectUntouched() {
  expect(state()).toBe(snapshot);
  expect(fake.db.ops).toHaveLength(0);
  expect(recoverMissingTriage).not.toHaveBeenCalled();
  expect(fake.admin.listUsers).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake.db.reset();
  fake.db.seed("organizations", [
    { id: ORG_A, is_active: true },
    { id: ORG_B, is_active: true },
  ]);
  fake.db.seed("hd_profiles", [
    { id: CUSTOMER_A, organization_id: ORG_A, role: "customer", is_active: true },
    { id: AGENT_B, organization_id: ORG_B, role: "agent", is_active: true },
  ]);
  fake.db.seed("hd_tickets", [
    {
      id: "t-a",
      ticket_number: 41,
      organization_id: ORG_A,
      created_by: CUSTOMER_A,
      assigned_to: null,
      status: "open",
      deleted_at: null,
      priority: "medium",
      created_at: "2099-01-01T00:00:00.000Z",
      response_due_at: "2099-01-02T00:00:00.000Z",
      resolution_due_at: "2099-01-03T00:00:00.000Z",
      first_agent_response_at: null,
      sla_response_breached: false,
      sla_resolution_breached: false,
      sla_breached: false,
    },
  ]);
  for (const table of ["hd_ticket_comments", "hd_notifications", "hd_ticket_audit_logs", "hd_customers_info", "hd_cron_state"]) {
    fake.db.seed(table, []);
  }
  snapshot = state();
  recoverMissingTriage.mockResolvedValue({ candidates: 0, recovered: 0, failed: 0 });
  fake.admin.listUsers.mockResolvedValue({
    data: {
      users: [
        { id: CUSTOMER_A, email: "customer.a@example.test" },
        { id: AGENT_B, email: "agent.b@example.test" },
      ],
    },
    error: null,
  });
  fake.admin.deleteUser.mockResolvedValue({ data: {}, error: null });
  signUp.mockResolvedValue({ data: { user: { id: NEW_USER }, session: null }, error: null });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => vi.unstubAllEnvs());

describeBearerMatrix({
  route: "GET /api/cron/sla",
  secret: SECRET,
  configure: (secret) => vi.stubEnv("CRON_SECRET", secret ?? ""),
  call: async (headers) => {
    const { GET } = await import("../../app/api/cron/sla/route");
    return GET(new Request("http://localhost/api/cron/sla", { headers }));
  },
  allowedStatus: 200,
  expectUntouched,
  verify: async (response) => {
    expect(await response.json()).toMatchObject({ ok: true, assessed: 1, completed: true });
  },
});

const inboundBody = { from: "Customer A <customer.a@example.test>", subject: "Help", text: "My screen is black" };
async function inbound(headers: Record<string, string>, body: unknown = inboundBody) {
  const { POST } = await import("../../app/api/email/inbound/route");
  return POST(new Request("http://localhost/api/email/inbound", { method: "POST", headers, body: JSON.stringify(body) }));
}

describeBearerMatrix({
  route: "POST /api/email/inbound",
  secret: SECRET,
  configure: (secret) => vi.stubEnv("EMAIL_INGEST_SECRET", secret ?? ""),
  call: (headers) => inbound(headers),
  allowedStatus: 200,
  expectUntouched,
  verify: async (response) => {
    expect((await response.json()).mode).toBe("create");
    const created = fake.db.rows("hd_tickets")[1];
    expect(created).toMatchObject({ organization_id: ORG_A, created_by: CUSTOMER_A, source: "email", status: "open" });
  },
});

describe("POST /api/email/inbound — tenant derivation", () => {
  const authorized = { authorization: `Bearer ${SECRET}` };
  beforeEach(() => vi.stubEnv("EMAIL_INGEST_SECRET", SECRET));

  it("an unknown sender creates nothing", async () => {
    const response = await inbound(authorized, { ...inboundBody, from: "stranger@example.test" });
    expect(response.status).toBe(404);
    expect(state()).toBe(snapshot);
  });

  it("the organization comes from the sender's profile, not from the payload", async () => {
    const response = await inbound(authorized, { ...inboundBody, organization_id: ORG_B, created_by: AGENT_B });
    expect(response.status).toBe(200);
    expect(fake.db.rows("hd_tickets")[1]).toMatchObject({ organization_id: ORG_A, created_by: CUSTOMER_A });
  });

  it("a sender of another organization cannot append to a ticket by quoting its number", async () => {
    const response = await inbound(authorized, {
      from: "agent.b@example.test",
      subject: "Re: TK-0041",
      text: "injected reply",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("create");
    expect(fake.db.rows("hd_ticket_comments")).toHaveLength(0);
    expect(fake.db.rows("hd_tickets")[1].organization_id).toBe(ORG_B);
  });

  it("the ticket's own customer replying by email appends a public comment", async () => {
    const response = await inbound(authorized, { ...inboundBody, subject: "Re: TK-0041" });
    expect((await response.json()).mode).toBe("append");
    expect(fake.db.rows("hd_ticket_comments")[0]).toMatchObject({ ticket_id: "t-a", author_id: CUSTOMER_A, is_internal: false });
  });
});

describe("authorization matrix: POST /api/auth/register (public)", () => {
  const valid = {
    name: "New Customer",
    email: "new.customer@example.test",
    password: "StrongPassword!2026",
    org_code: ORG_A,
  };
  async function register(body: unknown) {
    const { POST } = await import("../../app/api/auth/register/route");
    return POST(new NextRequest("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify(body) }));
  }
  const created = () => fake.db.rows("hd_profiles").find((row) => row.id === NEW_USER);

  it("no session is required: a visitor registers as a customer of the organization whose code they hold", async () => {
    const response = await register(valid);
    expect(response.status).toBe(200);
    expect(created()).toMatchObject({ organization_id: ORG_A, role: "customer", is_active: true });
  });

  it.each([["admin"], ["agent"], ["manager"], ["employee"]])(
    "wrong role: asking to be %s is rejected and nothing is created",
    async (role) => {
      expect((await register({ ...valid, role })).status).toBe(400);
      expect(signUp).not.toHaveBeenCalled();
      expect(state()).toBe(snapshot);
    }
  );

  it("other organization: an unknown organization code creates no account", async () => {
    const response = await register({ ...valid, org_code: "00000000-0000-4000-8000-00000000dead" });
    expect(response.status).toBe(404);
    expect(signUp).not.toHaveBeenCalled();
    expect(state()).toBe(snapshot);
  });

  it("other organization: an organization_id in the body does not override the code", async () => {
    expect((await register({ ...valid, organization_id: ORG_B, is_active: false })).status).toBe(200);
    expect(created()).toMatchObject({ organization_id: ORG_A, role: "customer" });
  });

  it("a weak password is rejected before any account exists", async () => {
    expect((await register({ ...valid, password: "weak" })).status).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("a failed profile write removes the account it had just created", async () => {
    fake.db.fail("hd_profiles", "upsert", { message: "boom" });
    expect((await register(valid)).status).toBe(500);
    expect(fake.admin.deleteUser).toHaveBeenCalledWith(NEW_USER);
  });
});
