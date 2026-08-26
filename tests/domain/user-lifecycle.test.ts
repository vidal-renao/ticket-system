import { describe, expect, it } from "vitest";
import {
  REFUSAL_STATUS,
  accountState,
  banDurationFor,
  canAdministerUser,
  isActionableRole,
} from "../../lib/user-lifecycle";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

const admin = { id: "admin-1", role: "admin", organizationId: ORG };

const target = (role: string, over: Partial<{ id: string; organizationId: string | null }> = {}) => ({
  id: over.id ?? "target-1",
  role,
  organizationId: "organizationId" in over ? over.organizationId! : ORG,
});

describe("who an administrator may act on", () => {
  it("allows agents and customers", () => {
    expect(canAdministerUser({ actor: admin, target: target("agent") })).toEqual({
      allowed: true,
      role: "agent",
    });
    expect(canAdministerUser({ actor: admin, target: target("customer") })).toEqual({
      allowed: true,
      role: "customer",
    });
  });

  it("refuses another administrator", () => {
    expect(canAdministerUser({ actor: admin, target: target("admin") })).toEqual({
      allowed: false,
      refusal: "protected_role",
    });
  });

  it("refuses a manager, same as an administrator", () => {
    // Managers are protected deliberately: they administer the system too, so
    // locking one out through this screen must take a demotion first.
    expect(canAdministerUser({ actor: admin, target: target("manager") })).toEqual({
      allowed: false,
      refusal: "protected_role",
    });
  });

  it("refuses acting on yourself", () => {
    expect(
      canAdministerUser({ actor: admin, target: target("agent", { id: admin.id }) })
    ).toEqual({ allowed: false, refusal: "self" });
  });

  it("refuses a self-action even when the roles would otherwise allow it", () => {
    // An administrator who demoted themselves to agent is still the actor.
    const selfAsAgent = { id: "admin-1", role: "agent", organizationId: ORG };
    expect(canAdministerUser({ actor: admin, target: selfAsAgent }).allowed).toBe(false);
  });

  it("refuses a caller who is not an administrator", () => {
    for (const role of ["manager", "agent", "customer", null]) {
      expect(
        canAdministerUser({
          actor: { id: "someone", role, organizationId: ORG },
          target: target("agent"),
        })
      ).toEqual({ allowed: false, refusal: "not_admin" });
    }
  });

  it("hides another tenant behind a not-found, never a role refusal", () => {
    // Checked before the role so the shape of the refusal cannot confirm that
    // an address belongs to an administrator somewhere else on this instance.
    expect(
      canAdministerUser({ actor: admin, target: target("admin", { organizationId: OTHER_ORG }) })
    ).toEqual({ allowed: false, refusal: "not_found" });
    expect(REFUSAL_STATUS.not_found).toBe(404);
  });

  it("treats a missing target and a target without an organization the same", () => {
    expect(canAdministerUser({ actor: admin, target: null }).allowed).toBe(false);
    expect(
      canAdministerUser({ actor: admin, target: target("agent", { organizationId: null }) })
    ).toEqual({ allowed: false, refusal: "not_found" });
  });

  it("refuses an administrator whose own organization is missing", () => {
    expect(
      canAdministerUser({
        actor: { id: "admin-1", role: "admin", organizationId: null },
        target: target("agent"),
      })
    ).toEqual({ allowed: false, refusal: "not_admin" });
  });

  it("answers every refusal with 403 or 404 and nothing else", () => {
    expect(new Set(Object.values(REFUSAL_STATUS))).toEqual(new Set([403, 404]));
  });
});

describe("actionable roles", () => {
  it("names exactly agent and customer", () => {
    expect(isActionableRole("agent")).toBe(true);
    expect(isActionableRole("customer")).toBe(true);
    expect(isActionableRole("manager")).toBe(false);
    expect(isActionableRole("admin")).toBe(false);
    expect(isActionableRole(null)).toBe(false);
    expect(isActionableRole(undefined)).toBe(false);
  });
});

describe("what state an account is in", () => {
  it("reads an untouched row as active", () => {
    // is_active predates this feature and defaults to true; a null must not
    // read as frozen or every legacy profile would be locked out at once.
    expect(accountState({ deletedAt: null, isActive: null })).toBe("active");
    expect(accountState({ deletedAt: null, isActive: undefined })).toBe("active");
    expect(accountState({ deletedAt: null, isActive: true })).toBe("active");
  });

  it("reads is_active false as frozen", () => {
    expect(accountState({ deletedAt: null, isActive: false })).toBe("frozen");
  });

  it("lets deletion win over frozen", () => {
    // A deleted account is also frozen; saying both helps nobody.
    expect(accountState({ deletedAt: "2026-08-26T00:00:00Z", isActive: false })).toBe("deleted");
    expect(accountState({ deletedAt: "2026-08-26T00:00:00Z", isActive: true })).toBe("deleted");
  });
});

describe("the ban durations handed to GoTrue", () => {
  it("uses a century to freeze and the literal 'none' to lift", () => {
    // 'none' is GoTrue's documented literal for lifting a ban -- not an empty
    // string, not null, either of which silently leaves the ban in place.
    expect(banDurationFor("freeze")).toBe("876000h");
    expect(banDurationFor("unfreeze")).toBe("none");
  });
});
