import { describe, expect, it } from "vitest";
import {
  planCustomerOnboarding,
  profileWriteMode,
  hasNoFirstAccess,
  alreadyCustomerMessage,
} from "../../lib/customer-onboarding";

const NOBODY = { existingUserId: null, existingProfile: null, confirmedLink: false };

describe("nobody has that address yet", () => {
  it("invites, confirmation or not", () => {
    expect(planCustomerOnboarding(NOBODY)).toEqual({ kind: "invite" });
    expect(planCustomerOnboarding({ ...NOBODY, confirmedLink: true })).toEqual({ kind: "invite" });
  });
});

describe("the address has an account from another application", () => {
  const OTHER_APP = { existingUserId: "user-1", existingProfile: null };

  it("asks before adopting it", () => {
    // Deliberate friction: an admin must see whose account they are attaching
    // to before a profile appears, the same shape as the emergency close.
    expect(planCustomerOnboarding({ ...OTHER_APP, confirmedLink: false })).toEqual({
      kind: "needs_confirmation",
    });
  });

  it("links it once confirmed, reusing the account rather than creating one", () => {
    expect(planCustomerOnboarding({ ...OTHER_APP, confirmedLink: true })).toEqual({
      kind: "link_existing",
      userId: "user-1",
    });
  });
});

describe("the address is already a customer here", () => {
  const EXISTING = {
    existingUserId: "user-2",
    existingProfile: { referenceCode: "VRE-COM-ABCD-EFGH" },
  };

  it("refuses, and names the customer it collides with", () => {
    expect(planCustomerOnboarding({ ...EXISTING, confirmedLink: false })).toEqual({
      kind: "already_customer",
      userId: "user-2",
      referenceCode: "VRE-COM-ABCD-EFGH",
    });
  });

  it("still refuses when the admin confirms the link", () => {
    // The confirmation means "adopt an account from another app", never
    // "overwrite a customer of this one". The old upsert rewrote
    // organization_id, role, customer_type and full_name from the form.
    expect(planCustomerOnboarding({ ...EXISTING, confirmedLink: true })).toEqual({
      kind: "already_customer",
      userId: "user-2",
      referenceCode: "VRE-COM-ABCD-EFGH",
    });
  });

  it("copes with a customer that has no reference code yet", () => {
    const plan = planCustomerOnboarding({
      existingUserId: "user-3",
      existingProfile: { referenceCode: null },
      confirmedLink: false,
    });
    expect(plan).toEqual({ kind: "already_customer", userId: "user-3", referenceCode: null });
  });
});

describe("how the profile row is written", () => {
  it("fills in the row the account-creation trigger already wrote", () => {
    // Regression: an invited account is not a blank slate.
    // on_auth_user_created inserts a bare hd_profiles row in the same statement
    // that creates the auth user, so an insert here hit a duplicate key and the
    // admin was told a brand-new address was "already a customer".
    expect(profileWriteMode("invite")).toBe("fill");
  });

  it("creates the row for an account adopted from another application", () => {
    // No trigger ran for us here -- the account predates this request and was
    // verified to have no profile -- so a conflict is a genuine race and must
    // fail rather than overwrite.
    expect(profileWriteMode("link_existing")).toBe("create");
  });
});

describe("spotting an invitation that was never completed", () => {
  // The real Alpen Logistics row, which sat in the directory for a day looking
  // healthy. Accepting the invitation produced a sign-in, so last_sign_in_at
  // was populated and told nobody anything; the heartbeat never fired, because
  // /reset-password is outside AppShell.
  const ALPEN = { invitedAt: "2026-08-15T14:51:58.562Z", lastSeenAt: null };

  it("flags an invited account that has never reached the application", () => {
    expect(hasNoFirstAccess(ALPEN)).toBe(true);
  });

  it("clears once they get in, however they got in", () => {
    // Including by sign-in link, holding no password at all -- they are in.
    expect(hasNoFirstAccess({ ...ALPEN, lastSeenAt: "2026-08-16T09:00:00Z" })).toBe(false);
  });

  it("never flags an account created with a password", () => {
    // Agents come from admin.createUser, which sets no invited_at. Lena
    // Brunner is the live example, and she must stay unmarked.
    expect(hasNoFirstAccess({ invitedAt: null, lastSeenAt: null })).toBe(false);
  });

  it("never flags a linked account, which was never invited", () => {
    expect(hasNoFirstAccess({ invitedAt: null, lastSeenAt: "2026-08-16T09:00:00Z" })).toBe(false);
  });
});

describe("what the admin is told about a collision", () => {
  it("quotes the reference code when there is one", () => {
    expect(alreadyCustomerMessage("VRE-CUS-1234-5678")).toContain("VRE-CUS-1234-5678");
  });

  it("stays readable without one", () => {
    const message = alreadyCustomerMessage(null);
    expect(message).toContain("already a customer");
    expect(message).not.toContain("null");
  });
});
