import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, createFakeSupabase } from "../helpers/fake-supabase";

const fake = createFakeSupabase(new FakeDb());
let serviceClientFactory: () => unknown = () => fake.client;
vi.mock("@/lib/supabase/server", () => ({
  createServiceClientStatic: () => serviceClientFactory(),
}));

import { logAdminEvent, recordLinkIssuance, sanitizeAuditDetails } from "@/lib/admin-audit";

const ORG = "00000000-0000-4000-8000-0000000000a0";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const TARGET = "00000000-0000-4000-8000-0000000000a4";
const rows = () => fake.db.rows("hd_admin_audit_logs");

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fake.db.reset();
  serviceClientFactory = () => fake.client;
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("logAdminEvent", () => {
  it("writes who, on whom, what and the outcome, with the contract's defaults", async () => {
    const written = await logAdminEvent({
      organizationId: ORG,
      actorId: ACTOR,
      action: "user.role_changed",
      targetType: "user",
      targetId: TARGET,
      details: { from: "agent", to: "manager" },
    });
    expect(written).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      organization_id: ORG,
      actor_id: ACTOR,
      actor_type: "user",
      action: "user.role_changed",
      target_type: "user",
      target_id: TARGET,
      outcome: "success",
      details: { from: "agent", to: "manager" },
    });
  });

  it("records failures and system actors", async () => {
    await logAdminEvent({ organizationId: ORG, actorId: null, actorType: "system", action: "user.frozen", outcome: "failure" });
    expect(rows()[0]).toMatchObject({ actor_id: null, actor_type: "system", outcome: "failure", target_type: null, target_id: null, details: {} });
  });

  it("never stores links, passwords, tokens or email addresses in details", async () => {
    await logAdminEvent({
      organizationId: ORG,
      actorId: ACTOR,
      action: "access_link.issued",
      details: {
        link_type: "recovery",
        action_link: "https://example.supabase.co/auth/v1/verify?token=abc",
        access_link: "anything",
        password: "Secret123!",
        new_password: "Secret123!",
        token: "abc",
        email: "person@example.test",
        contact_email: "person@example.test",
        note: "sent to person@example.test",
        where: "see https://example.test/reset#access_token=abc",
        nested: { secret: "x", reason: "email_delivered", deeper: { url: "https://x.test" } },
        delivered: true,
        attempts: 2,
        nothing: null,
      },
    });
    const stored = JSON.stringify(rows()[0].details);
    expect(rows()[0].details).toEqual({
      link_type: "recovery",
      nested: { reason: "email_delivered", deeper: {} },
      delivered: true,
      attempts: 2,
      nothing: null,
    });
    for (const forbidden of ["https://", "Secret123!", "person@example.test", "abc"]) {
      expect(stored).not.toContain(forbidden);
    }
  });

  it("sanitizeAuditDetails drops arrays' unsafe items, functions and very long text", () => {
    expect(
      sanitizeAuditDetails({ roles: ["agent", "a@b.ch", 3], fn: () => 1, long: "x".repeat(600), ok: "fine" })
    ).toEqual({ roles: ["agent", 3], ok: "fine" });
    expect(sanitizeAuditDetails(undefined)).toEqual({});
  });

  it("does not throw and reports false when the insert fails", async () => {
    fake.db.fail("hd_admin_audit_logs", "insert", { code: "42P01", message: "relation does not exist" });
    await expect(logAdminEvent({ organizationId: ORG, actorId: ACTOR, action: "user.created" })).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("[admin-audit] event not stored", expect.objectContaining({ action: "user.created", code: "42P01" }));
  });

  it("does not throw when the service client itself cannot be built", async () => {
    serviceClientFactory = () => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    };
    await expect(logAdminEvent({ organizationId: ORG, actorId: ACTOR, action: "user.created" })).resolves.toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("skips the table, but keeps the server log line, when there is no organization", async () => {
    await expect(logAdminEvent({ organizationId: null, actorId: ACTOR, action: "user.created", targetId: TARGET })).resolves.toBe(false);
    expect(rows()).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("[audit] admin event", expect.objectContaining({ action: "user.created", stored: false }));
  });

  it("always leaves a structured server log line without details", async () => {
    await logAdminEvent({ organizationId: ORG, actorId: ACTOR, action: "user.deleted", targetType: "user", targetId: TARGET, details: { x: 1 } });
    expect(info).toHaveBeenCalledWith("[audit] admin event", {
      action: "user.deleted",
      outcome: "success",
      actor_type: "user",
      actor_id: ACTOR,
      organization_id: ORG,
      target_type: "user",
      target_id: TARGET,
      stored: true,
    });
  });
});

describe("recordLinkIssuance", () => {
  const input = {
    source: "admin/users/password-reset",
    actorId: ACTOR,
    targetUserId: TARGET,
    organizationId: ORG,
    linkType: "recovery" as const,
    emailDelivered: false,
    decision: { link: "https://example.supabase.co/auth/v1/verify?token=abc", handedToAdmin: true, reason: "handed_to_admin" as const },
  };

  it("stores the issuance without the link and keeps the Phase 0 structured log line", async () => {
    await recordLinkIssuance(input);
    expect(rows()[0]).toMatchObject({
      action: "access_link.issued",
      actor_id: ACTOR,
      target_type: "user",
      target_id: TARGET,
      organization_id: ORG,
      details: {
        source: "admin/users/password-reset",
        link_type: "recovery",
        email_delivered: false,
        handed_to_admin: true,
        reason: "handed_to_admin",
      },
    });
    expect(JSON.stringify(rows()[0])).not.toContain("https://");
    expect(info).toHaveBeenCalledWith("[audit] access link issued", expect.objectContaining({ event: "access_link_issued" }));
    expect(JSON.stringify(info.mock.calls)).not.toContain("https://");
  });
});
