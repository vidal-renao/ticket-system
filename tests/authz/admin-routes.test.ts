import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";
import { describeAuthzMatrix } from "../helpers/authz-matrix";

/**
 * REQ-F1-08 (authorization matrix) and REQ-F1-06 (each administrative action
 * leaves an audit row) for /api/admin/users* and /api/admin/customers/*.
 */
const fake = createFakeSupabase(new FakeDb());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
  createServiceClient: async () => fake.client,
  createServiceClientStatic: () => fake.client,
}));
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  getAuthUserEmail: vi.fn(async () => null),
  ticketEmailSubject: () => "subject",
}));
vi.mock("@/lib/ticket-inheritance", () => ({
  adoptUnassignedTicketsForNewAgent: vi.fn(async () => []),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ORG_A = "00000000-0000-4000-8000-0000000000a0";
const ORG_B = "00000000-0000-4000-8000-0000000000b0";
const ADMIN_A = "00000000-0000-4000-8000-0000000000a1";
const AGENT_A = "00000000-0000-4000-8000-0000000000a2";
const MANAGER_A = "00000000-0000-4000-8000-0000000000a3";
const CUSTOMER_A = "00000000-0000-4000-8000-0000000000a4";
const ADMIN_B = "00000000-0000-4000-8000-0000000000b1";
const NEW_USER = "00000000-0000-4000-8000-0000000000ff";
const RECOVERY_LINK = "https://example.supabase.co/auth/v1/verify?token=recovery-token&type=recovery";

const WRONG_ROLES = [
  { userId: AGENT_A, status: 403, label: "agent" },
  { userId: MANAGER_A, status: 403, label: "manager" },
  { userId: CUSTOMER_A, status: 403, label: "customer" },
];

let snapshot = "";
const state = () =>
  JSON.stringify({
    profiles: fake.db.rows("hd_profiles"),
    customers: fake.db.rows("hd_customers_info"),
    organizations: fake.db.rows("organizations"),
  });
const audit = () => fake.db.rows("hd_admin_audit_logs");
const profile = (id: string) => fake.db.rows("hd_profiles").find((row) => row.id === id)!;

function expectUntouched() {
  expect(state()).toBe(snapshot);
  expect(audit()).toHaveLength(0);
  expect(fake.admin.createUser).not.toHaveBeenCalled();
  expect(fake.admin.updateUserById).not.toHaveBeenCalled();
  expect(fake.admin.generateLink).not.toHaveBeenCalled();
  expect(fake.admin.inviteUserByEmail).not.toHaveBeenCalled();
}

function json(body: unknown, method = "POST") {
  return new Request("http://localhost/api/admin", { method, body: JSON.stringify(body) });
}
const target = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ADMIN_LINK_HANDOFF", "");
  fake.db.reset();
  fake.db.seed("organizations", [
    { id: ORG_A, slug: "vidal-real-estate", is_active: true, settings: { pii_scrubbing_enabled: false } },
    { id: ORG_B, slug: "other-tenant", is_active: true, settings: {} },
  ]);
  fake.db.seed("hd_profiles", [
    { id: ADMIN_A, organization_id: ORG_A, role: "admin", is_active: true, deleted_at: null, full_name: "A Admin" },
    { id: AGENT_A, organization_id: ORG_A, role: "agent", is_active: true, deleted_at: null, full_name: "A Agent" },
    { id: MANAGER_A, organization_id: ORG_A, role: "manager", is_active: true, deleted_at: null, full_name: "A Manager" },
    { id: CUSTOMER_A, organization_id: ORG_A, role: "customer", is_active: true, deleted_at: null, full_name: "A Customer" },
    { id: ADMIN_B, organization_id: ORG_B, role: "admin", is_active: true, deleted_at: null, full_name: "B Admin" },
  ]);
  fake.db.seed("hd_customers_info", []);
  fake.db.seed("hd_admin_audit_logs", []);
  snapshot = state();

  fake.admin.createUser.mockResolvedValue({ data: { user: { id: NEW_USER } }, error: null });
  fake.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
  fake.admin.deleteUser.mockResolvedValue({ data: {}, error: null });
  fake.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  fake.admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: NEW_USER } }, error: null });
  fake.admin.getUserById.mockResolvedValue({ data: { user: { id: AGENT_A, email: "agent@example.test" } }, error: null });
  fake.admin.generateLink.mockResolvedValue({
    data: { user: { id: AGENT_A }, properties: { action_link: RECOVERY_LINK } },
    error: null,
  });
  sendEmail.mockResolvedValue({ delivered: true });
});

function expectNoSensitiveAudit() {
  const stored = JSON.stringify(audit());
  expect(stored).not.toContain("https://");
  expect(stored).not.toContain("@");
  expect(stored).not.toContain("StrongPassword");
  expect(stored).not.toContain("recovery-token");
}

// ---------------------------------------------------------------- users POST
describeAuthzMatrix({
  route: "POST /api/admin/users",
  signIn: fake.signIn,
  call: async () => {
    const { POST } = await import("../../app/api/admin/users/route");
    return POST(json({ name: "New Agent", email: "new.agent@example.test", password: "StrongPassword!2026", type: "agent" }));
  },
  wrongRole: WRONG_ROLES,
  // There is no foreign resource to aim at here: an administrator of another
  // organization is a correct caller, and what must hold is that the account
  // lands in *their* organization. That is the dedicated test below.
  otherOrganization: { userId: "00000000-0000-4000-8000-00000000dead", status: 403, label: "unknown profile" },
  allowed: {
    userId: ADMIN_A,
    status: 200,
    verify: () => {
      expect(profile(NEW_USER)).toMatchObject({ organization_id: ORG_A, role: "agent" });
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({
        organization_id: ORG_A,
        actor_id: ADMIN_A,
        actor_type: "user",
        action: "user.created",
        target_type: "user",
        target_id: NEW_USER,
        outcome: "success",
        details: { role: "agent" },
      });
      expectNoSensitiveAudit();
    },
  },
  expectUntouched,
});

describe("POST /api/admin/users — tenant derivation", () => {
  it("an administrator of another organization creates the account in their own organization, whatever the body says", async () => {
    fake.signIn(ADMIN_B);
    const { POST } = await import("../../app/api/admin/users/route");
    const response = await POST(
      json({ name: "X", email: "x@example.test", password: "StrongPassword!2026", type: "agent", organization_id: ORG_A, role: "admin" })
    );
    expect(response.status).toBe(200);
    expect(profile(NEW_USER)).toMatchObject({ organization_id: ORG_B, role: "agent" });
    expect(audit()[0]).toMatchObject({ organization_id: ORG_B, actor_id: ADMIN_B });
  });

  it("an administrator without an organization is refused", async () => {
    profile(ADMIN_A).organization_id = null;
    snapshot = state();
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/route");
    expect((await POST(json({ name: "X", email: "x@example.test", password: "StrongPassword!2026", type: "agent" }))).status).toBe(403);
    expectUntouched();
  });
});

// --------------------------------------------------------------- users PATCH
describeAuthzMatrix({
  route: "PATCH /api/admin/users/[id] (role change)",
  signIn: fake.signIn,
  call: async () => {
    const { PATCH } = await import("../../app/api/admin/users/[id]/route");
    return PATCH(json({ role: "manager" }, "PATCH"), target(AGENT_A));
  },
  wrongRole: WRONG_ROLES,
  otherOrganization: { userId: ADMIN_B, status: 404 },
  allowed: {
    userId: ADMIN_A,
    status: 200,
    verify: () => {
      expect(profile(AGENT_A).role).toBe("manager");
      const [update] = fake.db.opsFor("hd_profiles", "update");
      expect(update.filters).toContainEqual({ kind: "eq", column: "organization_id", value: ORG_A });
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({
        organization_id: ORG_A,
        actor_id: ADMIN_A,
        action: "user.role_changed",
        target_id: AGENT_A,
        outcome: "success",
        details: { from: "agent", to: "manager" },
      });
    },
  },
  expectUntouched,
});

describe("PATCH /api/admin/users/[id] — details", () => {
  async function patch(body: unknown, id = AGENT_A) {
    fake.signIn(ADMIN_A);
    const { PATCH } = await import("../../app/api/admin/users/[id]/route");
    return PATCH(json(body, "PATCH"), target(id));
  }

  it("a failed role change is audited as a failure and answered generically", async () => {
    fake.db.fail("hd_profiles", "update", { message: "violates check constraint profiles_role_check" });
    const response = await patch({ role: "manager" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("constraint");
    expect(audit()[0]).toMatchObject({ action: "user.role_changed", outcome: "failure" });
  });

  it("a specialty-only change is not a privilege change and writes no audit row", async () => {
    expect((await patch({ specialty: "networking" })).status).toBe(200);
    expect(audit()).toHaveLength(0);
  });

  it("an administrator cannot change their own role", async () => {
    expect((await patch({ role: "customer" }, ADMIN_A)).status).toBe(400);
    expect(profile(ADMIN_A).role).toBe("admin");
    expect(audit()).toHaveLength(0);
  });

  it("rejects a role outside the known set", async () => {
    expect((await patch({ role: "superuser" })).status).toBe(400);
    expect(audit()).toHaveLength(0);
  });
});

// -------------------------------------------------------------------- freeze
describeAuthzMatrix({
  route: "POST /api/admin/users/[id]/freeze",
  signIn: fake.signIn,
  call: async () => {
    const { POST } = await import("../../app/api/admin/users/[id]/freeze/route");
    return POST(json({ action: "freeze" }), target(AGENT_A));
  },
  wrongRole: WRONG_ROLES,
  otherOrganization: { userId: ADMIN_B, status: 404 },
  allowed: {
    userId: ADMIN_A,
    status: 200,
    verify: () => {
      expect(profile(AGENT_A).is_active).toBe(false);
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({ action: "user.frozen", actor_id: ADMIN_A, target_id: AGENT_A, outcome: "success", organization_id: ORG_A });
    },
  },
  expectUntouched,
});

describe("POST /api/admin/users/[id]/freeze — details", () => {
  it("unfreezing is audited under its own action", async () => {
    profile(AGENT_A).is_active = false;
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/freeze/route");
    expect((await POST(json({ action: "unfreeze" }), target(AGENT_A))).status).toBe(200);
    expect(audit()[0]).toMatchObject({ action: "user.unfrozen", outcome: "success" });
  });

  it("a freeze that the auth server refuses is audited as a failure", async () => {
    fake.admin.updateUserById.mockResolvedValue({ data: null, error: { message: "gotrue down" } });
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/freeze/route");
    expect((await POST(json({ action: "freeze" }), target(AGENT_A))).status).toBe(502);
    expect(profile(AGENT_A).is_active).toBe(true);
    expect(audit()[0]).toMatchObject({ action: "user.frozen", outcome: "failure" });
  });
});

// ----------------------------------------------------------- delete / restore
describeAuthzMatrix({
  route: "POST /api/admin/users/[id]/delete",
  signIn: fake.signIn,
  call: async () => {
    const { POST } = await import("../../app/api/admin/users/[id]/delete/route");
    return POST(json({ action: "delete", confirmation: "DELETE" }), target(AGENT_A));
  },
  wrongRole: WRONG_ROLES,
  otherOrganization: { userId: ADMIN_B, status: 404 },
  allowed: {
    userId: ADMIN_A,
    status: 200,
    verify: () => {
      expect(profile(AGENT_A)).toMatchObject({ is_active: false, deleted_by: ADMIN_A });
      expect(profile(AGENT_A).deleted_at).toBeTruthy();
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({ action: "user.deleted", actor_id: ADMIN_A, target_id: AGENT_A, outcome: "success" });
    },
  },
  expectUntouched,
});

describe("POST /api/admin/users/[id]/delete — details", () => {
  it("restoring is audited under its own action", async () => {
    Object.assign(profile(AGENT_A), { deleted_at: "2026-11-01T00:00:00Z", is_active: false });
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/delete/route");
    expect((await POST(json({ action: "restore", confirmation: "RESTORE" }), target(AGENT_A))).status).toBe(200);
    expect(profile(AGENT_A).deleted_at).toBeNull();
    expect(audit()[0]).toMatchObject({ action: "user.restored", outcome: "success" });
  });

  it("a delete whose freeze fails is audited as a failure", async () => {
    fake.admin.updateUserById.mockResolvedValue({ data: null, error: { message: "gotrue down" } });
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/delete/route");
    expect((await POST(json({ action: "delete", confirmation: "DELETE" }), target(AGENT_A))).status).toBe(502);
    expect(audit()[0]).toMatchObject({ action: "user.deleted", outcome: "failure" });
  });

  it("a wrong confirmation word changes nothing and is not audited", async () => {
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/delete/route");
    expect((await POST(json({ action: "delete", confirmation: "yes" }), target(AGENT_A))).status).toBe(400);
    expectUntouched();
  });
});

// ------------------------------------------------------------- password reset
describeAuthzMatrix({
  route: "POST /api/admin/users/[id]/password-reset",
  signIn: fake.signIn,
  call: async () => {
    const { POST } = await import("../../app/api/admin/users/[id]/password-reset/route");
    return POST(json({}), target(AGENT_A));
  },
  wrongRole: WRONG_ROLES,
  otherOrganization: { userId: ADMIN_B, status: 404 },
  allowed: {
    userId: ADMIN_A,
    status: 200,
    verify: async (response) => {
      const body = await response.json();
      expect(body.action_link).toBeNull();
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({
        organization_id: ORG_A,
        actor_id: ADMIN_A,
        action: "access_link.issued",
        target_type: "user",
        target_id: AGENT_A,
        outcome: "success",
        details: { source: "admin/users/password-reset", link_type: "recovery", email_delivered: true, handed_to_admin: false, reason: "email_delivered" },
      });
      expectNoSensitiveAudit();
    },
  },
  expectUntouched,
});

describe("POST /api/admin/users/[id]/password-reset — hand-off", () => {
  it("a link handed to the administrator is audited as such, and the link itself is never stored", async () => {
    vi.stubEnv("ADMIN_LINK_HANDOFF", "true");
    sendEmail.mockResolvedValue({ delivered: false, reason: "not_configured" });
    fake.signIn(ADMIN_A);
    const { POST } = await import("../../app/api/admin/users/[id]/password-reset/route");
    const response = await POST(json({}), target(AGENT_A));
    expect((await response.json()).action_link).toBe(RECOVERY_LINK);
    expect(audit()[0].details).toMatchObject({ handed_to_admin: true, reason: "handed_to_admin", email_delivered: false });
    expectNoSensitiveAudit();
  });
});

// ------------------------------------------------------------------ customers
const company = {
  legal_name: "Muster Immobilien AG",
  contact_email: "kontakt@example.test",
  contact_person: "Erika Muster",
  locale: "de",
};
const individual = { first_name: "Erika", last_name: "Muster", email: "erika@example.test", locale: "de" };

for (const [kind, body] of [["company", company], ["individual", individual]] as const) {
  const call = async () => {
    const route =
      kind === "company"
        ? await import("../../app/api/admin/customers/company/route")
        : await import("../../app/api/admin/customers/individual/route");
    return route.POST(json(body));
  };

  describeAuthzMatrix({
    route: `POST /api/admin/customers/${kind}`,
    signIn: fake.signIn,
    call,
    wrongRole: WRONG_ROLES,
    // The customer is created in the canonical organization; an administrator
    // of a different organization on the same instance must not be able to.
    otherOrganization: { userId: ADMIN_B, status: 403 },
    allowed: {
      userId: ADMIN_A,
      status: 200,
      verify: () => {
        expect(profile(NEW_USER)).toMatchObject({ organization_id: ORG_A, role: "customer", customer_type: kind });
        expect(audit().map((row) => row.action)).toEqual(["customer.created", "access_link.issued"]);
        expect(audit()[0]).toMatchObject({
          organization_id: ORG_A,
          actor_id: ADMIN_A,
          target_type: "user",
          target_id: NEW_USER,
          outcome: "success",
          details: { customer_type: kind, mode: "invited" },
        });
        expect(audit()[1]).toMatchObject({
          target_id: NEW_USER,
          details: { source: `admin/customers/${kind}`, link_type: "invite", email_delivered: true, handed_to_admin: false },
        });
        expectNoSensitiveAudit();
      },
    },
    expectUntouched,
  });

  describe(`POST /api/admin/customers/${kind} — linking`, () => {
    it("linking an existing account is audited as a creation with no link issuance", async () => {
      fake.admin.listUsers.mockResolvedValue({
        data: { users: [{ id: NEW_USER, email: kind === "company" ? company.contact_email : individual.email }] },
        error: null,
      });
      fake.signIn(ADMIN_A);
      const route =
        kind === "company"
          ? await import("../../app/api/admin/customers/company/route")
          : await import("../../app/api/admin/customers/individual/route");
      const response = await route.POST(json({ ...body, link_existing_user: true }));
      expect(response.status).toBe(200);
      expect(audit()).toHaveLength(1);
      expect(audit()[0]).toMatchObject({ action: "customer.created", details: { mode: "linked_existing_user" } });
      expect(fake.admin.inviteUserByEmail).not.toHaveBeenCalled();
    });
  });
}

// ---------------------------------------------------------------- PII toggle
describe("setPiiScrubbing (server action)", () => {
  async function toggle(enabled: boolean) {
    const { setPiiScrubbing } = await import("../../app/actions/org-settings");
    return setPiiScrubbing(enabled);
  }

  it("refuses without a session", async () => {
    fake.signIn(null);
    expect(await toggle(true)).toEqual({ error: "Unauthorized" });
    expectUntouched();
  });

  it.each([[AGENT_A], [MANAGER_A], [CUSTOMER_A]])("refuses a non-admin (%s)", async (userId) => {
    fake.signIn(userId);
    expect(await toggle(true)).toHaveProperty("error");
    expectUntouched();
  });

  it("an administrator changes only their own organization, and the change is audited", async () => {
    fake.signIn(ADMIN_B);
    expect(await toggle(true)).toEqual({ ok: true });
    const [orgA, orgB] = fake.db.rows("organizations");
    expect(orgA.settings).toEqual({ pii_scrubbing_enabled: false });
    expect(orgB.settings).toEqual({ pii_scrubbing_enabled: true });
    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({
      organization_id: ORG_B,
      actor_id: ADMIN_B,
      action: "org.pii_scrubbing_changed",
      target_type: "organization",
      target_id: ORG_B,
      outcome: "success",
      details: { enabled: true, previous: false },
    });
  });

  it("a failed change is audited as a failure", async () => {
    fake.db.fail("organizations", "update", { message: "boom" });
    fake.signIn(ADMIN_A);
    expect(await toggle(true)).toHaveProperty("error");
    expect(audit()[0]).toMatchObject({ action: "org.pii_scrubbing_changed", outcome: "failure" });
  });
});
